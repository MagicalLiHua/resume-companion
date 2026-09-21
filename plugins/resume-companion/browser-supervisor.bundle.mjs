#!/usr/bin/env node
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/browser-supervisor.ts
import { chmod as chmod3, open as open3, readFile as readFile3, unlink as unlink3 } from "node:fs/promises";
import { createConnection, createServer as createServer2 } from "node:net";

// src/chrome-profile.ts
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, readlink, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
function resolveChromeProfileDir(value = process.env.RESUME_COMPANION_CHROME_DATA_DIR) {
  if (value) {
    const expanded = value === "~" ? homedir() : value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
    return isAbsolute(expanded) ? resolve(expanded) : resolve(process.cwd(), expanded);
  }
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Resume Companion", "chrome-profile");
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Resume Companion", "chrome-profile");
  return join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "resume-companion", "chrome-profile");
}
function profileHash(profileDir3) {
  return createHash("sha256").update(profileDir3).digest("hex").slice(0, 12);
}
function processExists(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error2) {
    return typeof error2 === "object" && error2 !== null && "code" in error2 && error2.code === "EPERM";
  }
}
async function chromeProfileIsBusy(profileDir3) {
  const singletonLock = join(profileDir3, "SingletonLock");
  try {
    const metadata = await lstat(singletonLock);
    if (!metadata.isSymbolicLink()) return true;
    const target = await readlink(singletonLock);
    const pid = /-(\d+)$/.exec(target)?.[1];
    return pid ? processExists(Number(pid)) : true;
  } catch (error2) {
    const code = typeof error2 === "object" && error2 !== null && "code" in error2 ? error2.code : void 0;
    if (code === "ENOENT") return false;
    return true;
  }
}
var ChromeProfileLock = class {
  lockPath;
  profileDir;
  token = randomUUID();
  held = false;
  constructor(profileDir3) {
    this.profileDir = profileDir3;
    this.lockPath = join(dirname(profileDir3), "chrome-mcp.lock");
  }
  async acquire() {
    await mkdir(this.profileDir, { recursive: true, mode: 448 });
    await mkdir(dirname(this.lockPath), { recursive: true, mode: 448 });
    const record2 = {
      format: "resume-companion-chrome-lock",
      pid: process.pid,
      token: this.token,
      started_at: (/* @__PURE__ */ new Date()).toISOString(),
      profile_hash: profileHash(this.profileDir)
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const handle = await open(this.lockPath, "wx", 384);
        await handle.writeFile(`${JSON.stringify(record2)}
`, "utf8");
        await handle.sync();
        await handle.close();
        this.held = true;
        if (await chromeProfileIsBusy(this.profileDir)) {
          await this.release();
          throw new Error("profile_in_use: \u4E13\u7528 Chrome Profile \u6B63\u7531\u6B8B\u7559\u6216\u5916\u90E8 Chrome \u8FDB\u7A0B\u4F7F\u7528\uFF1B\u8BF7\u5148\u5173\u95ED\u5BF9\u5E94 Chrome \u7A97\u53E3");
        }
        return;
      } catch (error2) {
        const code = typeof error2 === "object" && error2 !== null && "code" in error2 ? error2.code : void 0;
        if (code !== "EEXIST") throw error2;
        const existing = await this.readExisting();
        if (!existing || processExists(existing.pid)) {
          throw new Error("profile_in_use: ApplyMCP \u4E13\u7528 Chrome \u6B63\u7531\u53E6\u4E00\u4E2A\u4EFB\u52A1\u4F7F\u7528\uFF1B\u8BF7\u5173\u95ED\u90A3\u4E2A\u4EFB\u52A1\u540E\u91CD\u8BD5");
        }
        if (await chromeProfileIsBusy(this.profileDir)) {
          throw new Error("profile_in_use: \u4E0A\u4E00\u4E2A MCP \u8FDB\u7A0B\u5DF2\u9000\u51FA\uFF0C\u4F46\u4E13\u7528 Chrome \u4ECD\u5728\u4F7F\u7528 Profile\uFF1B\u8BF7\u5148\u5173\u95ED\u8BE5 Chrome \u7A97\u53E3");
        }
        await unlink(this.lockPath).catch(() => void 0);
      }
    }
    throw new Error("profile_in_use: \u65E0\u6CD5\u5B89\u5168\u53D6\u5F97 ApplyMCP \u4E13\u7528 Chrome \u7684\u5B9E\u4F8B\u9501");
  }
  async release() {
    if (!this.held) return;
    const existing = await this.readExisting();
    if (existing?.token === this.token) await unlink(this.lockPath).catch(() => void 0);
    this.held = false;
  }
  async readExisting() {
    try {
      const raw = JSON.parse(await readFile(this.lockPath, "utf8"));
      if (raw.format !== "resume-companion-chrome-lock" || typeof raw.pid !== "number" || typeof raw.token !== "string") return null;
      return raw;
    } catch {
      return null;
    }
  }
};

// src/resume-browser-server.ts
import { existsSync } from "node:fs";
import { setTimeout as pause } from "node:timers/promises";
import { randomUUID as randomUUID8 } from "node:crypto";
import { dirname as dirname4, resolve as resolve4 } from "node:path";
import { fileURLToPath as fileURLToPath2, pathToFileURL } from "node:url";

// node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs2(_arg) {
  }
  util2.assertIs = assertIs2;
  function assertNever2(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever2;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object2) => {
    const keys = [];
    for (const key2 in object2) {
      if (Object.prototype.hasOwnProperty.call(object2, key2)) {
        keys.push(key2);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues2(array3, separator = " | ") {
    return array3.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues2;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue2) {
      return issue2.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error2) => {
      for (const issue2 of error2.issues) {
        if (issue2.code === "invalid_union") {
          issue2.unionErrors.map(processError);
        } else if (issue2.code === "invalid_return_type") {
          processError(issue2.returnTypeError);
        } else if (issue2.code === "invalid_arguments") {
          processError(issue2.argumentsError);
        } else if (issue2.path.length === 0) {
          fieldErrors._errors.push(mapper(issue2));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue2.path.length) {
            const el = issue2.path[i];
            const terminal = i === issue2.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue2));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue2) => issue2.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error2 = new ZodError(issues);
  return error2;
};

// node_modules/zod/v3/locales/en.js
var errorMap = (issue2, _ctx) => {
  let message;
  switch (issue2.code) {
    case ZodIssueCode.invalid_type:
      if (issue2.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue2.expected}, received ${issue2.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue2.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue2.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue2.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue2.options)}, received '${issue2.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue2.validation === "object") {
        if ("includes" in issue2.validation) {
          message = `Invalid input: must include "${issue2.validation.includes}"`;
          if (typeof issue2.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue2.validation.position}`;
          }
        } else if ("startsWith" in issue2.validation) {
          message = `Invalid input: must start with "${issue2.validation.startsWith}"`;
        } else if ("endsWith" in issue2.validation) {
          message = `Invalid input: must end with "${issue2.validation.endsWith}"`;
        } else {
          util.assertNever(issue2.validation);
        }
      } else if (issue2.validation !== "regex") {
        message = `Invalid ${issue2.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue2.type === "array")
        message = `Array must contain ${issue2.exact ? "exactly" : issue2.inclusive ? `at least` : `more than`} ${issue2.minimum} element(s)`;
      else if (issue2.type === "string")
        message = `String must contain ${issue2.exact ? "exactly" : issue2.inclusive ? `at least` : `over`} ${issue2.minimum} character(s)`;
      else if (issue2.type === "number")
        message = `Number must be ${issue2.exact ? `exactly equal to ` : issue2.inclusive ? `greater than or equal to ` : `greater than `}${issue2.minimum}`;
      else if (issue2.type === "bigint")
        message = `Number must be ${issue2.exact ? `exactly equal to ` : issue2.inclusive ? `greater than or equal to ` : `greater than `}${issue2.minimum}`;
      else if (issue2.type === "date")
        message = `Date must be ${issue2.exact ? `exactly equal to ` : issue2.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue2.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue2.type === "array")
        message = `Array must contain ${issue2.exact ? `exactly` : issue2.inclusive ? `at most` : `less than`} ${issue2.maximum} element(s)`;
      else if (issue2.type === "string")
        message = `String must contain ${issue2.exact ? `exactly` : issue2.inclusive ? `at most` : `under`} ${issue2.maximum} character(s)`;
      else if (issue2.type === "number")
        message = `Number must be ${issue2.exact ? `exactly` : issue2.inclusive ? `less than or equal to` : `less than`} ${issue2.maximum}`;
      else if (issue2.type === "bigint")
        message = `BigInt must be ${issue2.exact ? `exactly` : issue2.inclusive ? `less than or equal to` : `less than`} ${issue2.maximum}`;
      else if (issue2.type === "date")
        message = `Date must be ${issue2.exact ? `exactly` : issue2.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue2.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue2.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue2);
  }
  return { message };
};
var en_default = errorMap;

// node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue2 = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue2);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key2 = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key: key2,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key: key2, value } = pair;
      if (key2.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key2.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key2.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key2.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path, key2) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key2;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error2 = new ZodError(ctx.common.issues);
        this._error = error2;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check2, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check2(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check2, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check2(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform2) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform: transform2 }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version2) {
  if ((version2 === "v4" || !version2) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version2 === "v6" || !version2) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base642 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base642));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version2) {
  if ((version2 === "v4" || !version2) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version2 === "v6" || !version2) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString2 extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType2 = this._getType(input);
    if (parsedType2 !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check2 of this._def.checks) {
      if (check2.kind === "min") {
        if (input.data.length < check2.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check2.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "max") {
        if (input.data.length > check2.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check2.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "length") {
        const tooBig = input.data.length > check2.value;
        const tooSmall = input.data.length < check2.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check2.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check2.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check2.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check2.message
            });
          }
          status.dirty();
        }
      } else if (check2.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "regex") {
        check2.regex.lastIndex = 0;
        const testResult = check2.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "trim") {
        input.data = input.data.trim();
      } else if (check2.kind === "includes") {
        if (!input.data.includes(check2.value, check2.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check2.value, position: check2.position },
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check2.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check2.kind === "startsWith") {
        if (!input.data.startsWith(check2.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check2.value },
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "endsWith") {
        if (!input.data.endsWith(check2.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check2.value },
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "datetime") {
        const regex = datetimeRegex(check2);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "time") {
        const regex = timeRegex(check2);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "ip") {
        if (!isValidIP(input.data, check2.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "jwt") {
        if (!isValidJWT(input.data, check2.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "cidr") {
        if (!isValidCidr(input.data, check2.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check2.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check2);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check2) {
    return new _ZodString2({
      ...this._def,
      checks: [...this._def.checks, check2]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString2({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString2({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString2({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType2 = this._getType(input);
    if (parsedType2 !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check2 of this._def.checks) {
      if (check2.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "min") {
        const tooSmall = check2.inclusive ? input.data < check2.value : input.data <= check2.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check2.value,
            type: "number",
            inclusive: check2.inclusive,
            exact: false,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "max") {
        const tooBig = check2.inclusive ? input.data > check2.value : input.data >= check2.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check2.value,
            type: "number",
            inclusive: check2.inclusive,
            exact: false,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check2.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check2.value,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check2.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check2);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check2) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check2]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType2 = this._getType(input);
    if (parsedType2 !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check2 of this._def.checks) {
      if (check2.kind === "min") {
        const tooSmall = check2.inclusive ? input.data < check2.value : input.data <= check2.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check2.value,
            inclusive: check2.inclusive,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "max") {
        const tooBig = check2.inclusive ? input.data > check2.value : input.data >= check2.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check2.value,
            inclusive: check2.inclusive,
            message: check2.message
          });
          status.dirty();
        }
      } else if (check2.kind === "multipleOf") {
        if (input.data % check2.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check2.value,
            message: check2.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check2);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check2) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check2]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType2 = this._getType(input);
    if (parsedType2 !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType2 = this._getType(input);
    if (parsedType2 !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check2 of this._def.checks) {
      if (check2.kind === "min") {
        if (input.data.getTime() < check2.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check2.message,
            inclusive: true,
            exact: false,
            minimum: check2.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check2.kind === "max") {
        if (input.data.getTime() > check2.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check2.message,
            inclusive: true,
            exact: false,
            maximum: check2.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check2);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check2) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check2]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType2 = this._getType(input);
    if (parsedType2 !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType2 = this._getType(input);
    if (parsedType2 !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType2 = this._getType(input);
    if (parsedType2 !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType2 = this._getType(input);
    if (parsedType2 !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key2 in schema.shape) {
      const fieldSchema = schema.shape[key2];
      newShape[key2] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType2 = this._getType(input);
    if (parsedType2 !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key2 in ctx.data) {
        if (!shapeKeys.includes(key2)) {
          extraKeys.push(key2);
        }
      }
    }
    const pairs = [];
    for (const key2 of shapeKeys) {
      const keyValidator = shape[key2];
      const value = ctx.data[key2];
      pairs.push({
        key: { status: "valid", value: key2 },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key2)),
        alwaysSet: key2 in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key2 of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key2 },
            value: { status: "valid", value: ctx.data[key2] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key2 of extraKeys) {
        const value = ctx.data[key2];
        pairs.push({
          key: { status: "valid", value: key2 },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key2)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key2 in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key2 = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key: key2,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue2, ctx) => {
          const defaultError = this._def.errorMap?.(issue2, ctx).message ?? ctx.defaultError;
          if (issue2.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key2, schema) {
    return this.augment({ [key2]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key2 of util.objectKeys(mask)) {
      if (mask[key2] && this.shape[key2]) {
        shape[key2] = this.shape[key2];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key2 of util.objectKeys(this.shape)) {
      if (!mask[key2]) {
        shape[key2] = this.shape[key2];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key2 of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key2];
      if (mask && !mask[key2]) {
        newShape[key2] = fieldSchema;
      } else {
        newShape[key2] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key2 of util.objectKeys(this.shape)) {
      if (mask && !mask[key2]) {
        newShape[key2] = this.shape[key2];
      } else {
        const fieldSchema = this.shape[key2];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key2] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key2) => bKeys.indexOf(key2) !== -1);
    const newObj = { ...a, ...b };
    for (const key2 of sharedKeys) {
      const sharedValue = mergeValues(a[key2], b[key2]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key2] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key2 in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key2, ctx.path, key2)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key2], ctx.path, key2)),
        alwaysSet: key2 in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key2, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key2, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key2 = await pair.key;
          const value = await pair.value;
          if (key2.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key2.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key2.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key2 = pair.key;
        const value = pair.value;
        if (key2.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key2.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key2.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error2) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error2
        }
      });
    }
    function makeReturnsIssue(returns, error2) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error2
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error2 = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error2.addIssue(makeArgsIssue(args, e));
          throw error2;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error2.addIssue(makeReturnsIssue(result, e));
          throw error2;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess2, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess2 },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType2 = this._getType(input);
    if (parsedType2 === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType2 = this._getType(input);
    if (parsedType2 === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType2 = this._getType(input);
    if (parsedType2 !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = /* @__PURE__ */ Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check2, _params = {}, fatal) {
  if (check2)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check2(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: ((arg) => ZodString.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
};
var NEVER = INVALID;

// src/browser/debug-bridge.ts
import { chmod, unlink as unlink2 } from "node:fs/promises";
import { createServer } from "node:net";
import { join as join3 } from "node:path";

// src/browser/supervisor-protocol.ts
import { homedir as homedir2 } from "node:os";
import { lstat as lstat2, mkdir as mkdir2 } from "node:fs/promises";
import { join as join2 } from "node:path";
function supervisorSocketPath(profileDir3) {
  const id3 = profileHash(profileDir3);
  return process.platform === "win32" ? `\\\\.\\pipe\\resume-companion-browser-${id3}` : join2(supervisorRuntimeDir(), `${id3}.sock`);
}
function supervisorStartupLockPath(profileDir3) {
  return join2(supervisorRuntimeDir(), `${profileHash(profileDir3)}.start.lock`);
}
function supervisorRuntimeDir() {
  return process.platform === "win32" ? join2(process.env.LOCALAPPDATA || join2(homedir2(), "AppData", "Local"), "Resume Companion", "runtime") : `/tmp/resume-companion-${process.getuid()}`;
}
async function ensureSupervisorRuntimeDir() {
  const directory = supervisorRuntimeDir();
  await mkdir2(directory, { recursive: true, mode: 448 });
  const metadata = await lstat2(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || process.platform !== "win32" && (metadata.uid !== process.getuid() || (metadata.mode & 63) !== 0)) {
    throw new Error("browser_supervisor_runtime_unsafe: runtime directory must be private and owned by this user");
  }
}
function compareVersions(left, right) {
  const parse2 = (value) => value.split("+")[0].split("-")[0].split(".").map((item) => Number(item) || 0);
  const a = parse2(left);
  const b = parse2(right);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  if (left === right) return 0;
  const cachebuster = (value) => /^.+\+codex\.(.+)$/.exec(value)?.[1] ?? "";
  const leftCachebuster = cachebuster(left);
  const rightCachebuster = cachebuster(right);
  if (leftCachebuster === rightCachebuster) return 0;
  if (!leftCachebuster) return -1;
  if (!rightCachebuster) return 1;
  return leftCachebuster > rightCachebuster ? 1 : -1;
}

// src/browser/debug-bridge.ts
function debugSocketPath(profileDir3) {
  const id3 = profileHash(profileDir3);
  return process.platform === "win32" ? `\\\\.\\pipe\\resume-companion-debug-${id3}` : join3(supervisorRuntimeDir(), `${id3}.debug.sock`);
}
var BrowserDebugBridge = class {
  constructor(profileDir3, handle) {
    this.handle = handle;
    this.endpoint = debugSocketPath(profileDir3);
  }
  handle;
  endpoint;
  server;
  async start() {
    if (this.server) return;
    await ensureSupervisorRuntimeDir();
    if (process.platform !== "win32") await unlink2(this.endpoint).catch(() => void 0);
    const server = createServer((socket) => this.accept(socket));
    this.server = server;
    await new Promise((resolve5, reject) => {
      server.once("error", reject);
      server.listen(this.endpoint, () => {
        server.off("error", reject);
        resolve5();
      });
    });
    if (process.platform !== "win32") await chmod(this.endpoint, 384);
  }
  async close() {
    const server = this.server;
    this.server = void 0;
    if (server) await new Promise((resolve5) => server.close(() => resolve5()));
    if (process.platform !== "win32") await unlink2(this.endpoint).catch(() => void 0);
  }
  accept(socket) {
    socket.setEncoding("utf8");
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer, "utf8") > 64 * 1024) {
        socket.end(`${JSON.stringify({ ok: false, error: "request_too_large" })}
`);
        return;
      }
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      const line = buffer.slice(0, newline);
      buffer = "";
      void this.dispatch(socket, line);
    });
  }
  async dispatch(socket, line) {
    try {
      const request = JSON.parse(line);
      const result = await this.handle(request);
      socket.end(`${JSON.stringify({ ok: true, result })}
`);
    } catch (error2) {
      const message = error2 instanceof Error ? error2.message : String(error2);
      socket.end(`${JSON.stringify({ ok: false, error: message.slice(0, 500) })}
`);
    }
  }
};

// src/browser/privacy.ts
function redactBrowserText(value) {
  let precedingSensitiveLabel = "";
  const semantic = value.split("\n").map((line) => {
    const label2 = line.match(/(?:StaticText|textbox|combobox|spinbutton)\s+"([^"]*)"/i)?.[1] ?? "";
    const sensitive = /(手机号|手机号码|电话|邮箱|身份证|证件|护照|银行卡|出生日期|出生年月|生日|住址|家庭地址|账号|\bphone\b|\be-?mail\b|passport)/i;
    const context = sensitive.test(label2) ? label2 : !label2 ? precedingSensitiveLabel : "";
    if (/\bStaticText\b/.test(line)) precedingSensitiveLabel = sensitive.test(label2) ? label2 : "";
    if (/\b(textbox|combobox|spinbutton)\b/.test(line)) {
      precedingSensitiveLabel = "";
      if (context) return line.replace(/(\bvalue=")([^"]*)(")/g, (_match, prefix, raw, suffix) => {
        const valid = /邮箱|\be-?mail\b/i.test(context) ? /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(raw) : /电话|手机|\bphone\b/i.test(context) ? /^1\d{10}$/.test(raw) : /身份证|证件|护照|银行卡|passport/i.test(context) ? /^(?:\d{15}|\d{17}[\dXx]|\d{16,19})$/.test(raw) : false;
        return `${prefix}${!raw || valid ? raw : "<masked>"}${suffix}`;
      });
    }
    return line;
  }).join("\n");
  return semantic.replace(/([\w.+-]{1,64})@([\w.-]+\.[A-Za-z]{2,})/g, (_match, name, domain) => `${name.slice(0, Math.min(2, name.length))}******@${domain}`).replace(/(?<!\d)(1\d{2})\d{4}(\d{4})(?!\d)/g, "$1****$2").replace(/(?<!\d)(\d{3})\d{11}([\dXx]{4})(?![\dXx])/g, "$1***********$2").replace(/(?<!\d)(\d{3})\d{8}(\d{4})(?!\d)/g, "$1********$2").replace(/(?<!\d)(\d{4})\d{8,11}(\d{4})(?!\d)/g, "$1********$2").replace(/(?<!\d)\d{12,}(?!\d)/g, "<masked>").replace(/((?:出生日期|出生年月|生日)[^\n]{0,180}?value=")[^"]+(")/gi, "$1<masked>$2");
}

// src/browser/form-engine.ts
import { createHash as createHash2, randomUUID as randomUUID2 } from "node:crypto";

// src/browser/form-dom.ts
function createDomFormRuntime() {
  const text3 = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const norm = (value) => text3(value).replace(/[\s*：:]+/g, "").toLowerCase();
  const controlSelector = 'input:not([type="hidden"]),textarea,select,button,[contenteditable="true"],[role="textbox"],[role="combobox"],[role="checkbox"],[role="radio"],[role="switch"],[role="button"],[role="slider"],[role="spinbutton"],.phoenix-radio-group,.phoenix-select,.ant-radio-group';
  const sdSelect = '[class^="sd-Select-container-"],[class*=" sd-Select-container-"]';
  const sdInput = '[class^="sd-Input-container-"],[class*=" sd-Input-container-"]';
  const sdDropdown = '[class^="sd-Dropdown-container-"],[class*=" sd-Dropdown-container-"]';
  const udModule = '[class^="applyFormModuleWrapper__"],[class*=" applyFormModuleWrapper__"]';
  const udRecord = '[class^="apply-form-array-card__"],[class*=" apply-form-array-card__"]';
  const udRange = ".throne-biz-date-range-picker-wrapper";
  const sdModule = '[class^="apply-block-"],[class*=" apply-block-"],[class^="basic-block-"],[class*=" basic-block-"]';
  const sdRecord = '[class^="apply-fields-"][class*=" multi-"],[class*=" apply-fields-"][class*=" multi-"]';
  const overlaySelector = '.common-unmodeled-layer__layerContent,[role="listbox"],[role="menu"],[role="tree"],[role="dialog"],.ant-select-dropdown,.ant-cascader-menus,.ant-picker-dropdown,.ant-calendar-picker-container,.ui-autocomplete,.el-select-dropdown,.el-cascader__dropdown,.el-picker-panel,.ud__select__dropdown,.ud__picker-date-panel,.popup[aria-label],[class^="sd-Dropdown-dropdown-"],[class*=" sd-Dropdown-dropdown-"]';
  const optionSelector = '.area-item-container,.list-item-container,.phoenix-selectList__listItem,[role="option"],[role="treeitem"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],.ant-select-item-option,.ant-cascader-menu-item,.el-select-dropdown__item,.el-cascader-node,.ud__select__list__item,.ud__tree__node:has(input[type=checkbox]),[class^="sd-Select-common-item-"],[class*=" sd-Select-common-item-"],[class^="sd-Menu-content-item-"],[class*=" sd-Menu-content-item-"],li,td,button';
  const componentSelector = `.phoenix-select,.phoenix-radio-group,.ant-select,.ant-cascader,.el-select,.el-cascader,.ud__select,${sdSelect},${sdDropdown}`;
  const headingSelector = 'h1,h2,h3,h4,h5,h6,[role="heading"],.ant-card-head-title,.el-card__header,.form-title,.section-title,fieldset > legend';
  const job51Root = document.querySelector(".cornercol1") ?? document.querySelector(".corner_right");
  const job51 = Boolean(job51Root && document.querySelector('input[id="imgbtnNext"],input[id="imgbtnPrevious"],input[id="imgbtnSave"]'));
  const buttonLike = (element) => element.matches('button,[role="button"],input[type="submit"],input[type="button"],input[type="image"],input[type="reset"]');
  const definitionTitle = (element) => element.closest("dl")?.querySelector(":scope > dt") ?? null;
  const dayeeSections = /* @__PURE__ */ new Map();
  const dayeeRecords = /* @__PURE__ */ new Map();
  const dayeeAdds = /* @__PURE__ */ new Map();
  const guopinSections = /* @__PURE__ */ new Map();
  const educationSlots = /* @__PURE__ */ new Map();
  const guopinRecords = /* @__PURE__ */ new Map();
  const guopinPreviews = /* @__PURE__ */ new Map();
  const guopin = location.hostname === "c.iguopin.com" && Boolean(document.querySelector(".resume-left-content .item-section .section-title h2"));
  const job51Slots = /* @__PURE__ */ new Map();
  const job51Records = /* @__PURE__ */ new Map();
  let job51Add = null;
  const visible = (element) => {
    if (!(element instanceof HTMLElement) || element.closest('[hidden],[aria-hidden="true"],.common-unmodeled-layer-hidden')) return false;
    const proxy = element.matches("input") && element.closest(`${sdSelect},.phoenix-select`) || (element.matches("input[role=combobox]") ? element.closest(".ant-select,.el-select,.el-cascader,.ud__select") : null);
    const surface = proxy || element;
    const rect = surface.getBoundingClientRect();
    const style = getComputedStyle(surface);
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const certificateDialogs = guopin ? Array.from(document.querySelectorAll(".my-cascader-modal[role=dialog]")).filter((el) => visible(el) && text3(el.querySelector(".title-search .ant-select-selection-placeholder")?.textContent) === "\u8BF7\u586B\u5199\u8BC1\u4E66\u540D\u79F0" && Boolean(document.querySelector("#certificate .section-title h2"))) : [];
  const certificateDialog = certificateDialogs.length === 1 ? certificateDialogs[0] : void 0;
  const key2 = /* @__PURE__ */ Symbol.for("resume-companion.semantic-identities.v1");
  const host2 = window;
  const registry2 = host2[key2] ??= { ids: /* @__PURE__ */ new WeakMap(), next: 0, epoch: Math.random().toString(36).slice(2) };
  const identity3 = (element) => {
    let id3 = registry2.ids.get(element);
    if (!id3) {
      id3 = `${registry2.epoch}:${++registry2.next}`;
      registry2.ids.set(element, id3);
    }
    return id3;
  };
  const accessibleLabel = (element) => text3(element.getAttribute("aria-label")) || text3(
    text3(element.getAttribute("aria-labelledby")).split(/\s+/).map((id3) => document.getElementById(id3)?.textContent || "").join(" ")
  );
  const optionLabel = (element) => {
    const content = element.querySelector('.area-text-label,.item-text-label,.ant-select-item-option-content,.ant-cascader-menu-item-content,.el-cascader-node__label,.ud__select__list__item__content,.ud__tree__node__label,[class^="sd-Menu-content-item-"],[class*=" sd-Menu-content-item-"]');
    if (content) return text3(content.textContent);
    const clone2 = element.cloneNode(true);
    clone2.querySelectorAll('[aria-hidden="true"],[role="img"],svg').forEach((node) => node.remove());
    return accessibleLabel(element) || text3(clone2.textContent);
  };
  const titleTexts = /* @__PURE__ */ new WeakMap();
  const titleText = (node) => {
    if (titleTexts.has(node)) return titleTexts.get(node);
    const copy = node.cloneNode(true);
    copy.querySelectorAll('button,[role="button"],input,svg,style,script,[aria-hidden="true"],[class*="required-asterisk"]').forEach((el) => el.remove());
    const result = text3(copy.textContent).replace(/^[*\s]+|[*：:\s]+$/g, "");
    titleTexts.set(node, result);
    return result;
  };
  for (const section of document.querySelectorAll("form.ant-form > .form-cell")) {
    const heading = section.querySelector(":scope > .tit-wrap > .tit > p");
    const name = text3(heading?.textContent);
    if (!name || !visible(section)) continue;
    dayeeSections.set(section, name);
    const add = section.querySelector(":scope > .form-cell-right > .add-more > .add-more-btn");
    if (add) {
      dayeeAdds.set(add, `\u6DFB\u52A0${name}`);
      Array.from(section.querySelectorAll(":scope > .form-cell-right > .form-cell-inner")).filter(visible).forEach((record2, i) => dayeeRecords.set(record2, `${name} / \u7B2C${i + 1}\u6761`));
    }
  }
  const structuralTitle = (node) => Array.from(node.children).find((child) => Array.from(child.classList).some((name) => /^(?:(?:block|section|group|form|field|filed)[-_]?)?(?:title|heading|header|label)(?:[-_]|$)/i.test(name)) && Boolean(titleText(child)) && titleText(child).length <= 80 && !child.querySelector('input,textarea,select,[role="combobox"]'));
  if (guopin) for (const section of document.querySelectorAll(".resume-left-content > .item-section")) {
    const name = text3(section.querySelector(".section-title h2")?.textContent);
    if (!name || !visible(section)) continue;
    guopinSections.set(section, name);
    Array.from(section.querySelectorAll(".item-section-content-multiple > .edit-section,.item-section-content-multiple > .item-section-tpl")).filter(visible).forEach((record2, i) => {
      guopinRecords.set(record2, `${name} / \u7B2C${i + 1}\u6761`);
      if (record2.matches(".item-section-tpl") && !record2.querySelector(".edit-section")) {
        const anchors2 = {
          "\u9879\u76EE\u7ECF\u5386": [[".project_name-field strong", "\u9879\u76EE\u540D\u79F0"]],
          "\u5DE5\u4F5C/\u5B9E\u4E60\u7ECF\u5386": [[".company_name-field strong", "\u5355\u4F4D\u540D\u79F0"], [".job_name-field strong", "\u804C\u4F4D\u540D\u79F0"]],
          "\u6559\u80B2\u7ECF\u5386": [[".school_cn-field strong", "\u5B66\u6821\u540D\u79F0"]],
          "\u6C42\u804C\u610F\u5411": [[".position-field strong", "\u671F\u671B\u804C\u4F4D"], [".line-separator-list li:nth-child(1)", "\u85AA\u8D44\u8981\u6C42"], [".line-separator-list li:nth-child(2)", "\u5DE5\u4F5C\u5730\u533A"], [".line-separator-list li:nth-child(3)", "\u671F\u671B\u884C\u4E1A"]]
        };
        for (const [selector, label3] of anchors2[name] ?? []) {
          const node = record2.querySelector(selector);
          if (node) guopinPreviews.set(node, { label: label3, value: text3(node.textContent), date: false });
        }
        const period = record2.querySelector('[class*="period"] span');
        const range2 = text3(period?.textContent).match(/^(\d{4}-\d{2})至(\d{4}-\d{2}|今)/);
        const label2 = { "\u9879\u76EE\u7ECF\u5386": "\u8D77\u6B62\u65F6\u95F4", "\u5DE5\u4F5C/\u5B9E\u4E60\u7ECF\u5386": "\u5728\u804C\u65F6\u95F4", "\u6559\u80B2\u7ECF\u5386": "\u5C31\u8BFB\u5E74\u6708" }[name];
        if (period && range2 && label2) guopinPreviews.set(period, { label: label2, value: `${range2[1]} / ${range2[2] === "\u4ECA" ? "\u81F3\u4ECA" : range2[2]}`, date: true });
      }
    });
    for (const record2 of Array.from(section.querySelectorAll(".item-section-content:not(.item-section-content-multiple) > .item-section-tpl")).filter(visible)) {
      const node = name === "\u81EA\u6211\u8BC4\u4EF7" ? record2.querySelector(".assessment-field .value") : name === "\u8D44\u683C\u8BC1\u4E66" ? record2.querySelector(".my-tags") : null;
      if (node) guopinPreviews.set(node, { label: name === "\u8D44\u683C\u8BC1\u4E66" ? "\u8BC1\u4E66\u540D\u79F0" : "\u81EA\u6211\u8BC4\u4EF7", value: name === "\u8D44\u683C\u8BC1\u4E66" ? Array.from(node.querySelectorAll(".ant-tag")).map((n) => text3(n.textContent)).join(" / ") : text3(node.textContent), date: false });
    }
  }
  if (job51 && text3(job51Root?.querySelector("h1")?.textContent) === "\u6559\u80B2\u7ECF\u5386") {
    const rows = Array.from(job51Root.querySelectorAll("dl")).filter(visible);
    const titles = rows.map((row) => text3(row.querySelector(":scope > dt")?.textContent).replace(/[\s*＊]/g, ""));
    const second = titles.indexOf("\u5176\u4ED6\u5B66\u5386");
    if (titles[0] === "\u6700\u9AD8\u5B66\u5386" && second > 0 && titles.includes("\u6BD5\u4E1A\u5B66\u68212") && titles.includes("\u4E13\u4E1A2")) {
      rows.forEach((row, i) => job51Slots.set(row, `\u6559\u80B2\u7ECF\u5386 / \u7B2C${i < second ? 1 : 2}\u6761`));
      job51Records.set(rows[0], "\u6559\u80B2\u7ECF\u5386 / \u7B2C1\u6761");
      job51Records.set(rows[second], "\u6559\u80B2\u7ECF\u5386 / \u7B2C2\u6761");
    } else if (titles[0] === "\u6700\u9AD8\u5B66\u5386" && titles.some((t) => /^(博士|硕士|本科|大专)是否统招$/.test(t))) {
      let level = "", ordinal = 0;
      rows.forEach((row, i) => {
        const next = /^(博士|硕士|本科|大专)是否统招$/.exec(titles[i] ?? "")?.[1];
        if (next && next !== level) {
          level = next;
          ordinal++;
          job51Records.set(row, `\u6559\u80B2\u7ECF\u5386 / \u7B2C${ordinal}\u6761`);
        }
        if (level) job51Slots.set(row, `\u6559\u80B2\u7ECF\u5386 / \u7B2C${ordinal}\u6761`);
      });
    }
  }
  if (job51) {
    const section = text3(job51Root?.querySelector("h1")?.textContent);
    if (section === "\u6559\u80B2\u80CC\u666F") {
      const rows = Array.from(job51Root.querySelectorAll("dl")).filter(visible);
      const titles = rows.map((row) => titleText(row.querySelector(":scope > dt")).replace(/[\s*＊]/g, ""));
      const highest = titles.indexOf("\u6700\u9AD8\u5B66\u5386"), other = titles.indexOf("\u5176\u4ED6\u5B66\u53862");
      if (titles[0] === "\u9AD8\u4E2D\u6BD5\u4E1A\u5B66\u6821" && titles.includes("\u9AD8\u4E2D\u5165\u5B66\u65F6\u95F4") && highest > 0) {
        rows.forEach((row, i) => {
          if (i === highest || /报告|上传/.test(titles[i] ?? "")) return;
          const slot = i < highest ? "high_school" : other >= 0 && i >= other ? "other" : "highest";
          const scope = `\u6559\u80B2\u80CC\u666F / \u7B2C${slot === "high_school" ? 1 : slot === "highest" ? 2 : 3}\u6761`;
          educationSlots.set(row, slot);
          job51Slots.set(row, scope);
          if (![...job51Records.values()].includes(scope)) job51Records.set(row, scope);
        });
      }
    }
    const cards = Array.from(job51Root.querySelectorAll(".ci")).filter((el) => visible(el) && el.querySelector(":scope > dl") && el.querySelector(":scope > .tb input.btnAppend"));
    cards.forEach((card, i) => job51Records.set(card, `${section} / \u7B2C${i + 1}\u6761`));
    job51Add = cards.at(-1)?.querySelector(":scope > .tb input.btnAppend") ?? null;
  }
  const phoenixSections = /* @__PURE__ */ new Map();
  const phoenixRecords = /* @__PURE__ */ new Map();
  const phoenixAdds = /* @__PURE__ */ new Map();
  for (const form of document.querySelectorAll(".ux-standard-form .form[id]")) {
    if (!form.querySelector(".form-item--phoenix") || !visible(form)) continue;
    for (let parent = form.parentElement, depth = 0; parent && depth < 12; parent = parent.parentElement, depth++) {
      const heading = Array.from(parent.children).find((node) => node.id === form.id && !node.querySelector("input,textarea,select") && titleText(node));
      if (!heading) continue;
      const name = titleText(heading);
      phoenixSections.set(parent, name);
      const cards = Array.from(parent.querySelectorAll(".ux-standard-form")).filter((node) => node.querySelector(".form")?.id === form.id && visible(node));
      const add = Array.from(parent.querySelectorAll("div,span,a,button")).find((node) => node.id === `${form.id}_addButton`) || Array.from(parent.querySelectorAll("span,button,a")).find((node) => text3(node.textContent) === `\u6DFB\u52A0${name}` && !node.querySelector("span,button,a"));
      if (add) phoenixAdds.set(add, `\u6DFB\u52A0${name}`);
      if (add || cards.length > 1) cards.forEach((card, index) => phoenixRecords.set(card, `${name} / \u7B2C${index + 1}\u6761`));
      break;
    }
  }
  const phoenixDate = (element) => Boolean(element.closest(".phoenix-select")?.querySelector('[id$="field_date_time_picker"],[*|href$="field_date_time_picker"]'));
  const fieldContainers = /* @__PURE__ */ new WeakMap();
  const structuralField = (element) => {
    if (fieldContainers.has(element)) return fieldContainers.get(element);
    let found = null;
    if (element.closest(`${sdInput},[class^="sd-Textarea-"],[class*=" sd-Textarea-"]`)) {
      for (let parent = element.parentElement, depth = 0; parent && depth < 10; parent = parent.parentElement, depth++) {
        if (structuralTitle(parent)) {
          found = parent;
          break;
        }
        if (parent === document.body) break;
      }
    }
    fieldContainers.set(element, found);
    return found;
  };
  const dateGroups = /* @__PURE__ */ new Map();
  const udRanges = /* @__PURE__ */ new Map();
  const udFieldLabel = (element) => {
    const field = element.closest(".ud-formily-item");
    const label2 = field?.querySelector(":scope > .ud-formily-item-label .ud-formily-item-label-content");
    const base = (text3(label2?.textContent) || text3(field?.getAttribute("data-form-field-i18n-name"))).replace(/[＊*：:]+/g, "").trim();
    if (element.closest(".ud__select") && field && Array.from(field.querySelectorAll("input")).some((input) => !input.closest(".ud__select"))) {
      if (/手机号码|手机号|电话号码|phone/i.test(base)) return `${base} / \u533A\u53F7`;
      if (/个人证件|证件类型|身份证件/i.test(base)) return `${base} / \u7C7B\u578B`;
    }
    return base;
  };
  for (const root of document.querySelectorAll(udRange)) {
    const parts = Array.from(root.querySelectorAll("input:not([type=hidden])"));
    if (visible(root) && parts.length === 2 && udFieldLabel(root)) udRanges.set(root, parts);
  }
  if (guopin) for (const root of document.querySelectorAll(".item-section .resume-common-form-item .ant-picker-range")) {
    const parts = Array.from(root.querySelectorAll("input:not([type=hidden])"));
    if (visible(root) && parts.length === 2) udRanges.set(root, parts);
  }
  for (const input of document.querySelectorAll("input")) {
    if (!input.closest(sdSelect)) continue;
    const container = structuralField(input);
    if (!container || dateGroups.has(container) || !visible(container)) continue;
    const groupTitle = structuralTitle(container);
    if (!groupTitle || !/时间|日期|年月|月份|起止|期间|期限|出生|入学|毕业|入职|离职|date|period|duration/i.test(titleText(groupTitle))) continue;
    const parts = Array.from(container.querySelectorAll("input")).filter((node) => node.closest(sdSelect));
    const shape = parts.map((node, index) => {
      const expected = index % 2 ? "\u6708" : "\u5E74";
      if (node.placeholder) return node.placeholder;
      const display2 = text3(node.closest(sdSelect)?.querySelector('[class^="sd-Input-display-value-"],[class*=" sd-Input-display-value-"]')?.textContent);
      return (index % 2 ? /^(?:0?[1-9]|1[0-2])月?$/ : /^\d{4}年?$/).test(display2) ? expected : "";
    }).join("/");
    if (!["\u5E74/\u6708", "\u5E74/\u6708/\u5E74/\u6708"].includes(shape)) continue;
    const checks = Array.from(container.querySelectorAll('input[type="checkbox"]'));
    const current = checks.filter((node) => /^(至今|目前|在职|present|current)$/i.test(accessibleLabel(node) || text3(node.closest("label")?.textContent)));
    if (checks.length && (checks.length !== 1 || current.length !== 1 || parts.length !== 4)) continue;
    dateGroups.set(container, { parts, current: current[0] || null });
  }
  if (job51) for (const container of document.querySelectorAll("dl")) {
    const title = definitionTitle(container);
    if (!title || !/时间|日期|年月|起止|出生|入学|毕业/.test(titleText(title))) continue;
    const parts = Array.from(container.querySelectorAll("dd select")).filter(visible);
    if (![2, 4].includes(parts.length) || !parts.every((part, index) => {
      const values = Array.from(part.options).map((o) => text3(o.textContent)).filter((v) => !/^[-—请选择\s]*$/.test(v));
      return values.length > 0 && values.every((v) => (index % 2 ? /^(?:0?[1-9]|1[0-2])月?$/ : /^\d{4}年?$/).test(v));
    })) continue;
    dateGroups.set(container, { parts, current: null });
  }
  const structuredLabel = (element) => {
    const container = structuralField(element);
    const title = container && structuralTitle(container);
    if (!title) return "";
    const base = titleText(title);
    const inputs2 = Array.from(container.querySelectorAll("input"));
    if (element.closest(sdSelect) && /证件号码|个人证件|身份证件/.test(base) && inputs2.some((input) => !input.closest(sdSelect))) return `${base} / \u7C7B\u578B`;
    if (element.closest(sdSelect) && inputs2.length === 2 && inputs2.some((input) => input !== element && !input.closest(sdSelect) && (input.type === "tel" || /手机号|手机号码|电话号码|phone number/i.test(input.placeholder)))) return `${base} / \u533A\u53F7`;
    const parts = dateGroups.get(container)?.parts || [];
    if (parts.includes(element)) {
      const index = parts.indexOf(element);
      return `${base} / ${parts.length === 4 ? index < 2 ? "\u5F00\u59CB" : "\u7ED3\u675F" : ""}${index % 2 ? "\u6708" : "\u5E74"}`;
    }
    return base;
  };
  const labelOf = (element) => {
    if (element === certificateDialog) return "\u8BC1\u4E66\u540D\u79F0";
    if (certificateDialog?.contains(element) && buttonLike(element)) return text3(element.textContent).replace(/\s+/g, "") || accessibleLabel(element);
    if (guopinPreviews.has(element)) return guopinPreviews.get(element).label;
    if (guopin && element.closest(".item-section")) {
      const salary2 = element.closest(".two-salary-field");
      if (salary2) {
        const inputs2 = Array.from(salary2.querySelectorAll(".salary_monthly input[role=combobox]"));
        const index = inputs2.indexOf(element);
        if (index >= 0) return `\u85AA\u8D44\u8981\u6C42\uFF08\u5143/\u6708\uFF09 / ${index === 0 ? "\u6700\u4F4E" : "\u6700\u9AD8"}`;
      }
      if (buttonLike(element)) return text3(element.textContent).replace(/\s+/g, "");
      const item2 = element.closest(".resume-common-form-item");
      const title = item2?.querySelector(":scope > .ant-form-item-row > .ant-form-item-label > label");
      if (title) {
        const clone2 = title.cloneNode(true);
        clone2.querySelectorAll(".tip,svg,.anticon").forEach((e) => e.remove());
        const base = text3(clone2.textContent);
        const period = element.closest(".rangepicker-period");
        if (period && element instanceof HTMLInputElement) {
          if (element.closest(".period-end-temp")) return `${base} / \u7ED3\u675F`;
          if (element.closest(".period-end-date")) return `${base} / \u7ED3\u675F`;
          if (element.placeholder === "\u5F00\u59CB\u65F6\u95F4") return `${base} / \u5F00\u59CB`;
        }
        const range2 = element.closest(".ant-picker-range");
        if (range2 && element !== range2) {
          const inputs2 = Array.from(range2.querySelectorAll("input"));
          return `${base} / ${inputs2.indexOf(element) === 0 ? "\u5F00\u59CB" : "\u7ED3\u675F"}`;
        }
        return base;
      }
    }
    if (dayeeAdds.has(element)) return dayeeAdds.get(element);
    if (element.closest(".form-cell") && dayeeSections.has(element.closest(".form-cell"))) {
      const item2 = element.closest(".ant-form-item");
      const label3 = item2?.querySelector(":scope > .ant-form-item-label > label");
      if (label3 && !buttonLike(element)) {
        const clone2 = label3.cloneNode(true);
        clone2.querySelectorAll(".labelRequired,.anticon,svg,button").forEach((el) => el.remove());
        const base = text3(clone2.textContent).replace(/[?？*＊]+$/, "").trim();
        const parts = Array.from(item2.querySelectorAll('[role="combobox"]'));
        if (parts.length === 2 && parts.includes(element) && /城市|籍贯|居住地/.test(base)) return `${base} / ${parts.indexOf(element) ? "\u57CE\u5E02" : "\u7701\u4EFD"}`;
        return base;
      }
    }
    if (phoenixAdds.has(element)) return phoenixAdds.get(element);
    if (element.matches("input[type=checkbox]") && element.closest(".phoenix-checkbox")) return text3(element.closest(".phoenix-checkbox")?.textContent);
    if (element.closest(".form-item--phoenix") && !element.matches('button,[role="button"]')) {
      const field = element.closest(".form-item--phoenix");
      return text3(field.querySelector(":scope > .form-item__title .form-item__text")?.textContent);
    }
    if (dateGroups.has(element)) return titleText(structuralTitle(element) ?? definitionTitle(element));
    if (udRanges.has(element)) return udFieldLabel(element);
    const aria = accessibleLabel(element);
    if (aria) return aria;
    if (buttonLike(element) && (job51 || element instanceof HTMLInputElement)) {
      const explicit = text3(element.getAttribute("title") || element.getAttribute("alt"));
      const known = { imgbtnNext: "\u4E0B\u4E00\u6B65", imgbtnPrevious: "\u4E0A\u4E00\u6B65", imgbtnSave: "\u4FDD\u5B58", imgbtnSubmit: "\u6700\u7EC8\u63D0\u4EA4", btnPreview: "\u9884\u89C8" };
      return job51 && known[element.id] || explicit || text3(element.value) || text3(element.textContent);
    }
    const dt = job51 && definitionTitle(element);
    if (dt) {
      const dl = element.closest("dl");
      const slot = educationSlots.get(dl);
      const base = slot ? titleText(dt).replace(/^(?:高中|最高学历)/, "").replace(/2$/, "") : job51Slots.get(dl)?.endsWith("\u7B2C2\u6761") ? titleText(dt).replace(/2$/, "") : titleText(dt);
      const parts = dateGroups.get(dl)?.parts;
      if (parts?.includes(element)) {
        const i = parts.indexOf(element);
        return `${base} / ${parts.length === 4 ? i < 2 ? "\u5F00\u59CB" : "\u7ED3\u675F" : ""}${i % 2 ? "\u6708" : "\u5E74"}`;
      }
      const selects = Array.from(dl.querySelectorAll("dd select"));
      if (selects.length === 2 && selects.includes(element)) {
        const index = selects.indexOf(element);
        if (base === "\u6280\u80FD") return `${base} / ${index ? "\u540D\u79F0" : "\u7C7B\u522B"}`;
        if (base === "\u804C\u4F4D") return `${base} / ${index ? "\u804C\u4F4D" : "\u804C\u7C7B"}`;
        return `${base} / ${/城市|地点|居住地|籍贯|生源地/.test(base) ? index ? "\u57CE\u5E02" : "\u7701\u4EFD" : index ? "\u7B49\u7EA7" : "\u7C7B\u578B"}`;
      }
      if (selects.includes(element) && /手机|电话/.test(base)) return `${base} / \u533A\u53F7`;
      if (selects.includes(element) && /身份证号|证件号码/.test(base) && dl.querySelector("dd input:not([type=hidden])")) return `${base} / \u7C7B\u578B`;
      if (selects.length === 1 && element.matches("input:not([type=hidden])") && /手机|电话|身份证号|证件号码/.test(base)) return `${base} / \u53F7\u7801`;
      if (selects.length === 3 && selects.includes(element)) return `${base} / ${["\u7C7B\u578B", "\u7C7B\u522B", "\u660E\u7EC6"][selects.indexOf(element)]}`;
      return base;
    }
    if (element.matches(optionSelector) && element.closest(overlaySelector)) return optionLabel(element);
    if (!element.matches('button,[role="button"]') && element.closest(".ud-formily-item")) {
      const label3 = udFieldLabel(element);
      const range2 = element.closest(udRange);
      const parts = range2 && udRanges.get(range2);
      if (label3 && parts?.includes(element)) return `${label3} / ${parts.indexOf(element) === 0 ? "\u5F00\u59CB\u5E74\u6708" : "\u7ED3\u675F\u5E74\u6708"}`;
      if (label3) return label3;
    }
    const structured = structuredLabel(element);
    if (structured && !element.matches('button,[role="button"]')) return structured;
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      const labels = Array.from(element.labels ?? []).filter((label3) => !label3.matches(sdInput)).map((label3) => text3(label3.textContent)).filter(Boolean).join(" ");
      if (labels) return labels;
    }
    if (element.matches(optionSelector) && element.closest(overlaySelector)) return optionLabel(element);
    if (element.matches('button,[role="button"]') && !element.hasAttribute("aria-haspopup")) return optionLabel(element);
    const item = element.closest('.ant-form-item,.el-form-item,.form-item,[data-field],[role="group"]');
    const label2 = item?.querySelector("label,.ant-form-item-label,.el-form-item__label,legend,[data-label]");
    return text3(label2?.textContent) || text3(element.getAttribute("placeholder") || element.getAttribute("name") || element.innerText || element.textContent).slice(0, 160);
  };
  const regions = /* @__PURE__ */ new Map();
  for (const anchor of document.querySelectorAll('a[href*="#"]')) {
    const href = anchor.getAttribute("href") || "";
    try {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || !url.hash) continue;
      const region = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      const label2 = text3(anchor.textContent);
      if (region && visible(region) && label2 && label2.length <= 80 && (region.querySelector(controlSelector) || region.querySelector(".add-more-btn"))) regions.set(region, label2.replace(/\s*必填\s*$/, ""));
    } catch {
    }
  }
  const headings = Array.from(document.querySelectorAll(headingSelector)).filter((node) => visible(node) && Boolean(titleText(node)) && !node.closest('footer,[role="contentinfo"]'));
  const structuralRegions = /* @__PURE__ */ new Map();
  for (const input of document.querySelectorAll("input,textarea,select")) {
    const field = structuralField(input);
    if (!field) continue;
    for (let parent = field.parentElement, depth = 0; parent && depth < 6; parent = parent.parentElement, depth++) {
      const title = structuralTitle(parent);
      if (title && visible(title)) {
        structuralRegions.set(parent, titleText(title));
        break;
      }
    }
  }
  const scopeOf = (element) => {
    if (certificateDialog && (element === certificateDialog || certificateDialog.contains(element))) return "\u8D44\u683C\u8BC1\u4E66";
    for (let node = element; node; node = node.parentElement) {
      if (guopinRecords.has(node)) return guopinRecords.get(node);
      if (guopinSections.has(node)) return guopinSections.get(node);
    }
    if (element === job51Add) return text3(job51Root?.querySelector("h1")?.textContent);
    const slot = element.closest("dl");
    if (slot && job51Slots.has(slot)) return job51Slots.get(slot);
    const card = element.closest(".ci");
    if (card && job51Records.has(card)) return job51Records.get(card);
    for (let node = element; node; node = node.parentElement) {
      if (dayeeRecords.has(node)) return dayeeRecords.get(node);
      if (dayeeSections.has(node)) return dayeeSections.get(node);
    }
    for (let node = element; node; node = node.parentElement) {
      if (phoenixRecords.has(node)) return phoenixRecords.get(node);
      if (phoenixSections.has(node)) return phoenixSections.get(node);
    }
    const module = element.closest(udModule);
    const moduleLabel = text3(module?.querySelector(".applyFormModuleWrapper-title")?.textContent);
    if (module && moduleLabel) {
      const record2 = element.closest(udRecord);
      if (record2 && !(element.matches("button") && text3(element.textContent) === "\u6DFB\u52A0")) {
        const records = Array.from(module.querySelectorAll(udRecord)).filter((card2) => card2.closest(udModule) === module);
        return `${moduleLabel} / \u7B2C${records.indexOf(record2) + 1}\u6761`;
      }
      return moduleLabel;
    }
    const sdSection = element.closest(sdModule);
    const sdTitle = sdSection && structuralTitle(sdSection);
    if (sdSection && sdTitle && sdSection.querySelector(`${sdInput},textarea`)) {
      const name = titleText(sdTitle);
      const card2 = element.closest(sdRecord);
      if (card2 && card2.closest(sdModule) === sdSection) {
        const cards = Array.from(sdSection.querySelectorAll(sdRecord)).filter((node) => node.closest(sdModule) === sdSection);
        return `${name} / \u7B2C${cards.indexOf(card2) + 1}\u6761`;
      }
      return name;
    }
    for (let current = element.parentElement; current; current = current.parentElement) {
      const record2 = current.getAttribute("data-record-label");
      if (record2) return text3(record2);
      const region = regions.get(current);
      if (region) return region;
      const structuralRegion = structuralRegions.get(current);
      if (structuralRegion) return structuralRegion;
      if (current.matches('fieldset,section,article,form,[role="dialog"],[role="region"]')) {
        const aria = accessibleLabel(current);
        if (aria) return aria;
        const heading = current.querySelector(":scope > legend,:scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > header");
        if (heading && titleText(heading)) return titleText(heading);
      }
    }
    const previousHeading = headings.filter((node) => Boolean(node.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    return previousHeading ? titleText(previousHeading) : "";
  };
  const job51Companion = (element) => {
    if (!job51 || !element.matches(".custom-combobox-input")) return null;
    const row = element.closest("dl");
    let next = row?.nextElementSibling;
    const rawLabel = text3(row?.querySelector(":scope > dt")?.textContent).replace(/[\s*＊]/g, ""), prefix = /^(博士|硕士|本科|大专)/.exec(rawLabel)?.[0] ?? "";
    const label2 = rawLabel.slice(prefix.length);
    if (prefix) {
      const title = `${prefix}\u5176\u4ED6${/学校/.test(label2) ? "\u5B66\u6821" : "\u4E13\u4E1A"}`;
      const candidates = Array.from((row?.closest(".ci") ?? job51Root).querySelectorAll("dl")).filter((d) => text3(d.querySelector(":scope > dt")?.textContent).replace(/[\s*＊]/g, "") === title);
      next = candidates.length === 1 ? candidates[0] : null;
    }
    const other = text3(next?.querySelector(":scope > dt")?.textContent).replace(new RegExp(`^${prefix}`), "");
    if (!next?.matches("dl") || !(/学校/.test(label2) && /^其他学校/.test(other) || /专业/.test(label2) && /^其他专业/.test(other))) return null;
    return next.querySelector("dd input:not([type=hidden])");
  };
  const valueOf = (element) => {
    if (element === certificateDialog) return { value: Array.from(element.querySelectorAll(".flat-foot .select-list .select-item")).map(optionLabel).join(" / "), checked: null };
    if (guopinPreviews.has(element)) return { value: guopinPreviews.get(element).value, checked: null };
    if (job51 && element.matches(".custom-combobox-input")) {
      const select = element.closest("dd")?.querySelector("select[data-dict]");
      const selected = select ? Array.from(select.selectedOptions).filter((o) => o.value && !/^[-—请选择\s]*$/.test(text3(o.textContent))).map((o) => text3(o.textContent)).join(" / ") : "";
      return { value: /^其他(?:院校|专业)$/.test(selected) && job51Companion(element) ? job51Companion(element).value : selected, checked: null };
    }
    if (element.matches(".ant-radio-group")) return { value: text3(element.querySelector(".ant-radio-wrapper-checked,.ant-radio-button-wrapper-checked")?.textContent), checked: null };
    if (element.matches(".phoenix-radio-group")) return { value: text3(element.querySelector(".phoenix-radio--checked .phoenix-radio__radio-text")?.textContent), checked: null };
    if (element.matches(".phoenix-select")) {
      const selected = element.closest(".phoenix-select").querySelectorAll(".phoenix-select__tipWrapper--visible .phoenix-select__tipEle,.phoenix-select__tag");
      return { value: Array.from(selected).filter(visible).map((node) => text3(node.textContent)).join(" / "), checked: null };
    }
    if (element instanceof HTMLInputElement && element.closest("label.day_info")?.closest(sdDropdown)) {
      const month3 = /^(\d{4}-\d{2})(?:\s*[（(]\d+岁[）)])?$/.exec(element.value.trim());
      return { value: month3?.[1] ?? element.value, checked: null };
    }
    const udDates = udRanges.get(element);
    if (udDates) return { value: udDates.some((input) => input.value) ? udDates.map((input) => input.value).join(" / ") : "", checked: null };
    const group = dateGroups.get(element);
    if (group) {
      const values = group.parts.map((part) => valueOf(part).value);
      const endpoint2 = (index) => {
        const year = values[index] || "", month3 = values[index + 1] || "";
        const y = /^(\d{1,4})\s*年?$/.exec(year), m = /^(\d{1,2})\s*月?$/.exec(month3);
        return y && m ? `${y[1].padStart(4, "0")}-${m[1].padStart(2, "0")}` : [year, month3].filter(Boolean).join(" / ");
      };
      return { value: [endpoint2(0), group.parts.length === 4 ? group.current?.checked ? "\u81F3\u4ECA" : endpoint2(2) : ""].filter(Boolean).join(" / "), checked: null };
    }
    if (guopin && element instanceof HTMLInputElement && element.closest(".period-end-date") && !element.value) {
      const proxy = element.closest(".period-end")?.querySelector(".period-end-temp input");
      if (proxy?.value === "\u81F3\u4ECA") return { value: "\u81F3\u4ECA", checked: null };
    }
    if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) return { value: element.value, checked: element.checked };
    if (["checkbox", "radio", "switch"].includes(element.getAttribute("role") || "")) return { value: "", checked: element.getAttribute("aria-checked") === "true" };
    const component = element.closest(componentSelector);
    if (component && element.matches('input,[role="combobox"]')) {
      if (component.matches(".ud__select") && !component.querySelector(".ud__select__selector") && element instanceof HTMLInputElement)
        return { value: element.value, checked: null };
      const items = Array.from(component.querySelectorAll('.ant-select-selection-item,.ant-select-selection-selected-value,.el-select__selected-item:not(.is-transparent):not(.el-select__input-wrapper),.el-cascader__tags .el-tag,.ud__select__selector__selectItem,.ud__select__selector__tag .ud__tag__content,[class^="sd-Input-display-value-"],[class*=" sd-Input-display-value-"]')).filter((item) => !item.closest(overlaySelector) && visible(item)).map((item) => text3(item.textContent)).filter(Boolean);
      if (items.length) return { value: items.join(" / "), checked: null };
      if (component.matches(".ud__select") && element instanceof HTMLInputElement && !element.readOnly && component.querySelector(".ud__select__selector-hide-arrow") && !component.querySelector(".ud__select__selector-readOnly,.ud__select__selector-multiple,.ud__select__selector__selectItem") && element.getAttribute("aria-expanded") !== "true" && !component.classList.contains("ud__select-open") && !component.contains(document.activeElement)) return { value: element.value, checked: null };
      if (component.matches(`.ant-select,.el-select,.ud__select,${sdSelect},${sdDropdown}`)) return { value: "", checked: null };
    }
    if (element instanceof HTMLInputElement) return { value: element.type === "password" ? element.value ? "<present>" : "" : element.value, checked: null };
    if (element instanceof HTMLTextAreaElement) return { value: element.value, checked: null };
    if (element instanceof HTMLSelectElement) return { value: Array.from(element.selectedOptions).filter((option) => (option.value !== "" || job51 && /身份证号码? \/ 类型$/.test(labelOf(element)) && text3(option.textContent) === "\u56FD\u5185\u8EAB\u4EFD\u8BC1\u6216\u62A4\u7167\uFF08\u542B\u6E2F\u6FB3\u53F0\uFF09") && !/^[-—请选择\s]*$/.test(text3(option.textContent))).map((option) => text3(option.textContent)).join(" / "), checked: null };
    return { value: text3(element.getAttribute("aria-valuetext") || element.getAttribute("aria-valuenow") || (element.isContentEditable || element.hasAttribute("aria-haspopup") || element.hasAttribute("aria-expanded") ? element.innerText : "")), checked: null };
  };
  const fields2 = Array.from(document.querySelectorAll(controlSelector)).filter((element) => {
    const popup = element.closest(overlaySelector);
    return !(guopin && element.closest(".item-section-tpl") && !element.closest(".edit-section") && !buttonLike(element)) && !(guopin && element.matches("input") && element.closest(".period-end-temp") && element.closest(".period-end")?.querySelector(".period-end-date .ant-picker input")) && !(job51 && element.matches("input.btnAppend") && element !== job51Add) && !element.matches('input[type="file"]') && !(element.matches("input") && (element.closest(".phoenix-select,.ant-radio-group") || element.closest(".ant-select") && element.closest("[role=combobox]") && element.closest("[role=combobox]") !== element)) && !element.closest(".ant-rate") && visible(element) && (!popup || popup.matches('[role="dialog"]'));
  });
  if (certificateDialog) {
    for (let i = fields2.length - 1; i >= 0; i--) if (certificateDialog.contains(fields2[i]) && !buttonLike(fields2[i])) fields2.splice(i, 1);
    fields2.push(certificateDialog);
  }
  fields2.push(...guopinPreviews.keys());
  fields2.push(...phoenixAdds.keys());
  fields2.push(...dayeeAdds.keys());
  fields2.push(...dateGroups.keys());
  fields2.push(...udRanges.keys());
  const errorSelector = '.form-item__error,.form-item__errorMessage,[role="alert"],.ant-form-item-explain-error,.ant-form-item-control.has-error .ant-form-explain,.el-form-item__error,.ud-formily-item-error-help,.invalid-feedback';
  const definitionErrors = (element) => job51 ? Array.from(element.querySelectorAll("dd label font")).filter((el) => visible(el) && /不能为空|请选择|请填写|不正确|无效|格式|必须|错误|不能|不得|超过/.test(text3(el.textContent))) : [];
  const errorOf = (element) => {
    const linked = [element.getAttribute("aria-errormessage"), element.getAttribute("aria-describedby")].filter(Boolean).join(" ").split(/\s+/).map((id3) => document.getElementById(id3)).filter((el) => Boolean(el && visible(el) && (el.matches(errorSelector) || element.getAttribute("aria-invalid") === "true")));
    const container = element.closest(".ud-formily-item,.ant-form-item,.el-form-item,.form-item--phoenix");
    const pair = element.closest(".cascader-plugins-wrap");
    const pairControls = pair ? Array.from(pair.querySelectorAll("[role=combobox]")) : [];
    const selectedParent = Boolean(element.closest(".form-cell") && dayeeSections.has(element.closest(".form-cell")) && pairControls.length === 2 && pairControls[0] === element && valueOf(element).value);
    const local = container && !selectedParent ? Array.from(container.querySelectorAll(errorSelector)).filter((el) => visible(el) && el.closest(".ud-formily-item,.ant-form-item,.el-form-item,.form-item--phoenix") === container) : [];
    const dl = element.closest("dl");
    return [...new Set([...linked, ...local, ...dl ? definitionErrors(dl) : []].map((el) => text3(el.textContent)).filter(Boolean))].join(" / ");
  };
  const policyContextOf = (element) => {
    const labels = [];
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      const heading = node.matches("dl") ? node.querySelector(":scope > dt") : node.matches("fieldset") ? node.querySelector(":scope > legend") : node.matches('.ant-form-item,.el-form-item,.ud-formily-item,.form-item,[data-field],[role="group"]') ? node.querySelector(":scope > label,:scope > legend,:scope > .ant-form-item-label,:scope > .ud-formily-item-label") : null;
      const label2 = heading ? titleText(heading) : node.matches('[role="group"]') ? accessibleLabel(node) : "";
      if (label2 && !labels.includes(label2)) labels.push(label2.slice(0, 240));
      if (labels.length >= 6) break;
    }
    return labels.join(" / ");
  };
  const meta = (element, index) => {
    const input = element instanceof HTMLInputElement ? element : null;
    const control = element;
    const component = element.closest(componentSelector);
    const freeName = Boolean(input && !input.readOnly && component?.matches(".ud__select") && component.querySelector(".ud__select__selector-hide-arrow") && !component.querySelector(".ud__select__selector-readOnly,.ud__select__selector-multiple,.ud__select__selector__selectItem"));
    const autocomplete = Boolean(input?.closest(".phoenix-auto-complete-container"));
    const job51Autocomplete = Boolean(job51 && input?.matches(".custom-combobox-input") && input.closest("dd")?.querySelector("select[data-dict]"));
    const dayee = Boolean(element.closest(".form-cell") && dayeeSections.has(element.closest(".form-cell")));
    const dayeeDictionary = Boolean(dayee && input && /^请选择(?:最高学历毕业院校|最高学历专业|学校|专业)/.test(input.placeholder));
    const choice = job51Autocomplete || dayeeDictionary || autocomplete || element instanceof HTMLSelectElement || element.getAttribute("role") === "combobox" || Boolean(component?.querySelector(".ud__select__selector")) || Boolean(element.closest(`${sdSelect},${sdDropdown},.phoenix-select`)) || element.matches(".phoenix-radio-group,.ant-radio-group");
    const inputMode = element === certificateDialog ? "choice" : guopinPreviews.get(element)?.date || dateGroups.has(element) || udRanges.has(element) || phoenixDate(element) || input && (["date", "month"].includes(input.type) || Boolean(input.closest(".ant-calendar-picker")) || Boolean(guopin && input.closest(".ant-picker")) || Boolean(job51 && input.readOnly && /setday\(this\)/.test(input.getAttribute("onfocus") ?? "")) || Boolean(input.closest("label.day_info")?.closest(sdDropdown))) ? "date" : input && ["checkbox", "radio"].includes(input.type) ? "boolean" : freeName ? "choice_or_custom" : choice ? "choice" : "text";
    const value = valueOf(element);
    const radioGroup = input?.type === "radio" && input.name ? Array.from(input.getRootNode().querySelectorAll('input[type="radio"]')).filter((other) => other.name === input.name && other.form === input.form) : [];
    return {
      ...radioGroup.length ? { choiceGroup: { id: identity3(radioGroup[0]), label: policyContextOf(element).split(" / ")[0] || labelOf(element), answered: radioGroup.some((r) => r.checked), required: radioGroup.some((r) => r.required || r.getAttribute("aria-required") === "true") } } : {},
      inputMode,
      ...job51Companion(element) ? { relatedFields: [labelOf(job51Companion(element))] } : {},
      ...job51 && input?.readOnly && /setday\(this\)/.test(input.getAttribute("onfocus") ?? "") || dayee && location.hostname === "faw-zhaopin.hotjob.cn" && input?.closest(".ant-calendar-picker") && /^(开始时间|结束时间|出生日期|考试时间)$/.test(labelOf(element)) ? { datePrecision: "date" } : {},
      ...guopin && (element.closest(".item-section") || element === certificateDialog) ? { plannerFamily: "guopin" } : dayee ? { plannerFamily: "dayee" } : job51 ? { plannerFamily: "job51" } : element.closest(".form-item--phoenix") ? { plannerFamily: "phoenix" } : element.closest(sdModule) || element.closest(sdSelect) ? { plannerFamily: "sd" } : element.closest(udModule) || element.closest(".ud-formily-item") ? { plannerFamily: "ud" } : {},
      pendingInput: Boolean(job51Autocomplete && input?.value && input.value !== text3(input.closest("dd")?.querySelector("select[data-dict] option:checked")?.textContent)) || Boolean(autocomplete && input === document.activeElement && input?.value) || Boolean(element.matches(".phoenix-select") && element.querySelector("input")?.value && !value.value) || Boolean(input && !job51Autocomplete && ["choice", "choice_or_custom"].includes(inputMode) && input.value && !value.value),
      frame: 0,
      index,
      identity: identity3(element),
      tag: element.tagName.toLowerCase(),
      ...element.closest("dl") && educationSlots.has(element.closest("dl")) ? { educationSlot: educationSlots.get(element.closest("dl")) } : {},
      role: element === certificateDialog ? "combobox" : guopinPreviews.get(element)?.date || dateGroups.has(element) || udRanges.has(element) ? "date-group" : text3(element.getAttribute("role") || (buttonLike(element) || phoenixAdds.has(element) || dayeeAdds.has(element) ? "button" : element.matches(".phoenix-radio-group,.phoenix-select,.ant-radio-group") || element.matches("input") && element.closest(`${sdSelect},${sdDropdown},.phoenix-select`) ? "combobox" : "")),
      type: text3(input?.type || element.getAttribute("type")),
      label: labelOf(element),
      scope: scopeOf(element),
      ...value,
      policyContext: policyContextOf(element),
      disabled: guopinPreviews.has(element) || Boolean(control.disabled) || element.getAttribute("aria-disabled") === "true" || Boolean(element.closest('.phoenix-select--disabled,.phoenix-radio--disabled,.ant-select-disabled,.el-select.is-disabled,.el-cascader.is-disabled,.ud__select-disabled,[class*="sd-Input-disabled-"],[class*="sd-Menu-disabled-"],[class*="sd-Select-disabled-"]')),
      readonly: guopinPreviews.has(element) || Boolean(input?.readOnly || element instanceof HTMLTextAreaElement && element.readOnly) || element.getAttribute("aria-readonly") === "true",
      required: !buttonLike(element) && (Boolean(guopin && element.closest(".two-salary-field")?.querySelector(":scope > .ant-form-item-row > .ant-form-item-label > .ant-form-item-required")) || Boolean(guopin && element.closest(".resume-common-form-item")?.querySelector(":scope > .ant-form-item-row > .ant-form-item-label > .ant-form-item-required")) || Boolean(element.closest(".form-item--phoenix")?.querySelector(":scope > .form-item__title .form-item__required")) || Boolean(control.required) || element.getAttribute("aria-required") === "true" || Boolean(element.closest(".ud-formily-item")?.querySelector(":scope > .ud-formily-item-label .ud-formily-item-asterisk")) || Boolean(job51 && /[*＊]/.test(definitionTitle(element)?.textContent ?? "")) || Boolean(element.closest(".ant-form-item")?.querySelector(".ant-form-item-required"))),
      visible: visible(element),
      options: element instanceof HTMLSelectElement ? Array.from(element.options).filter((option) => !option.disabled).map((option) => text3(option.textContent)).filter(Boolean) : [],
      constraints: { minlength: "minLength" in control && control.minLength >= 0 ? control.minLength : null, maxlength: "maxLength" in control && control.maxLength >= 0 ? control.maxLength : null, min: text3(element.getAttribute("min")) || null, max: text3(element.getAttribute("max")) || null, step: text3(element.getAttribute("step")) || null, pattern: text3(element.getAttribute("pattern")) || null },
      invalid: Boolean(errorOf(element)) || element.getAttribute("aria-invalid") === "true" || Boolean(control.validity && !control.validity.valid),
      error: errorOf(element)
    };
  };
  const navigationMenu = (node) => {
    if (!node.matches('[role="menu"]')) return false;
    if (node.matches(".ant-menu-root") || node.closest('nav,header,[role="navigation"]')) return true;
    const items = Array.from(node.querySelectorAll('[role="menuitem"],li'));
    return items.length > 0 && items.every((item) => item.matches("a[href]") || Boolean(item.querySelector("a[href]")));
  };
  const overlays = Array.from(document.querySelectorAll(overlaySelector)).filter((node) => visible(node) && !navigationMenu(node)).filter((node) => !node.parentElement?.closest(overlaySelector) || !visible(node.parentElement.closest(overlaySelector)));
  const optionsIn = (root) => {
    const explicit = Array.from(root.querySelectorAll(optionSelector)).filter(visible);
    const fallback = Array.from(root.querySelectorAll('[role="listbox"] > *,[role="menu"] > *,[role="tree"] > *'));
    if (root.matches('[role="listbox"],[role="menu"],[role="tree"]')) fallback.push(...root.children);
    const items = [.../* @__PURE__ */ new Set([...explicit, ...fallback.filter((node) => !explicit.some((other) => node.contains(other) || other.contains(node)))])];
    return items.filter((node) => visible(node) && Boolean(optionLabel(node)) && !items.some((other) => other !== node && other.contains(node)));
  };
  const ownedBy = (root, trigger) => {
    const ids = text3(`${trigger.getAttribute("aria-controls") || ""} ${trigger.getAttribute("aria-owns") || ""}`).split(/\s+/).filter(Boolean);
    if (trigger.closest(".phoenix-select--active") && root.matches(".common-unmodeled-layer__layerContent"))
      return Array.from(document.querySelectorAll(".phoenix-select--active")).filter(visible).length === 1 && overlays.filter((n) => n.matches(".common-unmodeled-layer__layerContent")).length === 1;
    return ids.some((id3) => {
      const controlled = document.getElementById(id3);
      return controlled && (root === controlled || root.contains(controlled) || controlled.contains(root));
    }) || Boolean(trigger.closest(componentSelector)?.contains(root)) || Boolean(trigger.closest(sdDropdown)?.contains(root)) || Boolean(root.parentElement === trigger.parentElement && trigger !== root && !root.contains(trigger)) || Boolean(accessibleLabel(root) && norm(accessibleLabel(root)).includes(norm(labelOf(trigger))));
  };
  const hasOverlay = (spec) => fields2.some((trigger) => (!spec.identity || identity3(trigger) === spec.identity) && norm(labelOf(trigger)) === norm(spec.field) && (!spec.scope || spec.scope === "page" || norm(scopeOf(trigger)) === norm(spec.scope)) && (trigger.getAttribute("aria-expanded") === "true" || overlays.some((root) => ownedBy(root, trigger))));
  const ranked = (spec) => {
    const target = norm(spec.option ?? spec.field);
    const scope = norm(spec.scope) === "page" ? "" : norm(spec.scope);
    let nodes = fields2;
    if (spec.option !== void 0) {
      const triggers = fields2.filter((node) => (!spec.identity || identity3(node) === spec.identity) && norm(labelOf(node)) === norm(spec.field) && (!scope || norm(scopeOf(node)) === scope));
      let roots = overlays.filter((root) => triggers.some((trigger) => ownedBy(root, trigger)));
      if (!roots.length && triggers.length === 1 && overlays.length === 1 && !fields2.some((other) => other !== triggers[0] && ownedBy(overlays[0], other))) roots = overlays;
      nodes = roots.flatMap((root) => {
        const columns = Array.from(root.querySelectorAll(".ant-cascader-menu,.el-cascader-menu")).filter(visible);
        if (spec.optionLevel !== void 0 && columns.length) return columns[spec.optionLevel] ? optionsIn(columns[spec.optionLevel]) : [];
        return optionsIn(root);
      });
    }
    return nodes.map((element, index) => {
      if (spec.option === void 0 && spec.identity && identity3(element) !== spec.identity) return null;
      const data = meta(element, index);
      if (spec.option === void 0 && scope && norm(data.scope) !== scope) return null;
      const isOption = spec.option !== void 0;
      if (isOption && data.disabled) return null;
      const label2 = isOption ? optionLabel(element) : data.label;
      const roles = [data.tag, data.role, data.type, isOption ? "option" : "", data.tag === "input" ? "input" : ""];
      if (spec.roles?.length && !spec.roles.some((role) => roles.includes(role))) return null;
      const labelNorm = norm(label2);
      const score = !isOption && spec.identity || labelNorm === target ? 120 : !isOption && !spec.identity && target && labelNorm.includes(target) ? 72 : 0;
      if (!score) return null;
      return { element, meta: { ...data, label: label2, score } };
    }).filter((item) => item !== null).sort((a, b) => b.meta.score - a.meta.score);
  };
  const resolve5 = (spec) => {
    const results = ranked(spec);
    return results[0] && results[0].meta.score !== results[1]?.meta.score ? results[0].element : null;
  };
  const collect = () => ({
    documentId: registry2.epoch,
    attachments: Array.from(document.querySelectorAll('input[type="file"]')).flatMap((input) => {
      const container = input.closest(".ud-formily-item,.ant-form-item,.form-item--phoenix,.resume-common-form-item,dl,[data-field],fieldset,label") ?? input.parentElement;
      if (input.disabled || !container || !visible(container)) return [];
      const data = meta(input, -1), preview = job51 && /^照片/.test(data.label) ? container.querySelector("#imgPreview") : null;
      const accepted = Boolean(preview && visible(preview) && preview.complete && preview.naturalWidth > 0) || Boolean(container.querySelectorAll('input[type="file"]').length === 1 && Array.from(container.querySelectorAll(".ant-upload-list-item-done")).some(visible) && !Array.from(container.querySelectorAll(".ant-upload-list-item-error")).some(visible));
      return [{
        frame: 0,
        scope: data.scope,
        field: data.label || "\u9644\u4EF6",
        required: data.required,
        state: accepted ? "accepted_ui" : input.files?.length ? "selected_unverified" : "pending"
      }];
    }),
    ...job51 ? { workflow: (() => {
      const items = Array.from(document.querySelectorAll("li.leftli1,li.leftli2")).filter(visible);
      const active = items.filter((el) => el.classList.contains("leftli2"));
      const steps = items.map((el) => text3(el.querySelector(".lispan")?.textContent || el.getAttribute("title")));
      const next = document.querySelector("#imgbtnNext");
      const heading = text3(job51Root?.querySelector("h1")?.textContent);
      return {
        family: "job51",
        template: `${location.origin}${location.pathname}:${new URL(location.href).searchParams.get("CtmID") ?? ""}`,
        steps,
        current: active.length === 1 ? items.indexOf(active[0]) : -1,
        heading,
        next: Boolean(next && visible(next) && !next.disabled && next.title === "Next"),
        manual: Array.from(job51Root.querySelectorAll("dl")).filter(visible).filter((row) => {
          const title = text3(row.querySelector(":scope > dt")?.textContent);
          if (/[*＊]/.test(title) && row.querySelector("input[type=file],iframe[src*=UpLoad]")) {
            const preview = row.querySelector("#imgPreview");
            return !(/^照片/.test(title) && preview && visible(preview) && preview.complete && preview.naturalWidth > 0);
          }
          if (!/声明|承诺|授权|签署|同意.*(?:身份证|个人信息|条款|隐私)/.test(title)) return false;
          const controls = Array.from(row.querySelectorAll("select,input[type=checkbox],input[type=radio]")).filter(visible);
          return !controls.length || !controls.some((el) => el instanceof HTMLSelectElement ? Boolean(valueOf(el).value) : el.checked);
        }).map((row) => titleText(row.querySelector(":scope > dt"))),
        optionalAttachment: /无附件[，,]?\s*直接点击下一步/.test(text3(job51Root?.textContent))
      };
    })() } : {},
    ...Array.from(document.querySelectorAll('[role="dialog"],.ant-modal')).some((el) => visible(el) && /当前未登录或登录状态失效|登录(?:状态|信息|会话)?(?:已)?(?:失效|过期)/.test(text3(el.textContent))) ? { authenticationRequired: true } : {},
    records: [...guopinRecords.keys(), ...job51Records.keys(), ...dayeeRecords.keys(), ...phoenixRecords.keys(), ...Array.from(document.querySelectorAll(`${udRecord},${sdRecord},[data-record-label]`))].filter(visible).map((node) => ({ identity: identity3(node), scope: scopeOf(node), frame: 0 })),
    fields: fields2.map(meta),
    overlays: overlays.map((root) => ({ frame: 0, role: root.getAttribute("role") || "overlay", label: fields2.filter((trigger) => ownedBy(root, trigger)).map(labelOf)[0] || accessibleLabel(root), options: optionsIn(root).map(optionLabel).slice(0, 120) })),
    sections: [...new Set([...dayeeSections.values(), ...phoenixSections.values(), ...regions.values(), ...structuralRegions.values(), ...Array.from(document.querySelectorAll(udModule)).filter(visible).map((node) => titleText(node.querySelector(".applyFormModuleWrapper-title") ?? node)), ...headings.filter((node) => ![...regions.keys()].some((region) => region.contains(node))).map(titleText), ...Array.from(document.querySelectorAll('section[aria-label],[role="region"][aria-label]')).filter(visible).map(accessibleLabel)].filter(Boolean))],
    validations: [...new Set([...Array.from(document.querySelectorAll(`${errorSelector},[aria-live],.error`)).filter(visible), ...definitionErrors(document.documentElement)].map((node) => text3(node.textContent)).filter(Boolean))]
  });
  const setValue = (spec, value) => {
    const element = resolve5(spec);
    if (!element || element.disabled || element.getAttribute("aria-disabled") === "true" || element.readOnly) return { applied: false };
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      let next = String(value);
      let property = "value";
      if (element instanceof HTMLSelectElement) {
        const option = Array.from(element.options).find((item) => !item.disabled && (item.value === next || text3(item.textContent) === next));
        if (!option) return { applied: false };
        next = option.value;
      } else if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
        property = "checked";
        next = Boolean(value);
      }
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, property)?.set?.call(element, next);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { applied: true };
    }
    if (element instanceof HTMLElement && element.isContentEditable) {
      element.focus();
      element.textContent = String(value);
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
      return { applied: true };
    }
    return { applied: false };
  };
  const click = (spec) => {
    const element = resolve5(spec);
    if (!(element instanceof HTMLElement) || element.disabled || element.getAttribute("aria-disabled") === "true") return { applied: false };
    element.focus({ preventScroll: true });
    element.click();
    return { applied: true };
  };
  return {
    collect,
    describe: (element) => meta(element, fields2.indexOf(element)),
    candidates: (spec) => ranked(spec).map((item) => item.meta).slice(0, 20),
    resolve: resolve5,
    setValue,
    click,
    hasOverlay,
    dateGroup: (element) => {
      const group = dateGroups.get(element);
      return group ? {
        parts: group.parts.map((part, index) => ({ element: part, meta: meta(part, index), endpoint: index < 2 ? "start" : "end", part: index % 2 ? "month" : "year" })),
        current: group.current ? { element: group.current, checked: group.current.checked, disabled: group.current.disabled } : null
      } : null;
    }
  };
}

// src/browser/controls/dom.ts
function createControlDom(common) {
  const sdSelect = '[class^="sd-Select-container-"],[class*=" sd-Select-container-"]';
  const sdDropdown = '[class^="sd-Dropdown-container-"],[class*=" sd-Dropdown-container-"]';
  const sdMenu = '[class^="sd-Select-menu-"],[class*=" sd-Select-menu-"]';
  const sdItem = '[class^="sd-Menu-content-item-"],[class*=" sd-Menu-content-item-"]';
  const text3 = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const norm = (value) => text3(value).replace(/[\s*：:]+/g, "").toLowerCase();
  const visible = (el) => {
    if (!(el instanceof HTMLElement) || el.closest('[hidden],[aria-hidden="true"],.common-unmodeled-layer-hidden')) return false;
    const proxy = el.matches("input") && el.closest(`${sdSelect},.phoenix-select`) || (el.matches("input[role=combobox]") ? el.closest(".ant-select,.el-select,.el-cascader,.ud__select") : null);
    const surface = proxy || el;
    const box = surface.getBoundingClientRect();
    const style = getComputedStyle(surface);
    return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
  };
  const key2 = /* @__PURE__ */ Symbol.for("resume-companion.control-dom.v1");
  const host2 = window;
  const registry2 = host2[key2] ??= {
    ids: /* @__PURE__ */ new WeakMap(),
    nodes: /* @__PURE__ */ new Map(),
    next: 0,
    epoch: Math.random().toString(36).slice(2)
  };
  const token = (el) => {
    if (!el) return null;
    let id3 = registry2.ids.get(el);
    if (!id3) {
      id3 = `${registry2.epoch}:${++registry2.next}`;
      registry2.ids.set(el, id3);
      registry2.nodes.set(id3, new WeakRef(el));
    }
    if (registry2.nodes.size > 4e3) {
      for (const [key3, ref] of registry2.nodes)
        if (!ref.deref()?.isConnected) registry2.nodes.delete(key3);
    }
    return id3;
  };
  const element = (id3) => {
    const el = registry2.nodes.get(id3)?.deref();
    return el?.isConnected && visible(el) ? el : null;
  };
  const disabled = (el) => Boolean(
    el.disabled || el.getAttribute("aria-disabled") === "true" || el.closest(
      '.phoenix-selectList__listItem--disabled,.phoenix-radio--disabled,.phoenix-select--disabled,.ant-calendar-disabled-cell,.ant-calendar-year-panel-cell-disabled,.ant-calendar-month-panel-cell-disabled,.ant-select-dropdown-menu-item-disabled,.phoenix-calendar-disabled-cell,.phoenix-calendar-year-panel-disabled-cell,.phoenix-calendar-month-panel-disabled-cell,.ant-picker-cell-disabled,.ant-select-item-option-disabled,.ant-cascader-menu-item-disabled,.is-disabled,td.disabled,.ud__select-disabled,.ud__select__list__item-disabled,.ud__picker__cell-disabled,[class*="sd-Input-disabled-"],[class*="sd-Menu-disabled-"],[class*="sd-Select-disabled-"]'
    )
  );
  const componentSelector = `.custom-combobox,.phoenix-auto-complete-container,.phoenix-select,.phoenix-radio-group,.ant-radio-group,.ant-picker,.ant-calendar-picker,.el-date-editor,.ant-select,.el-cascader,.el-select,.ud__select,.throne-biz-date-range-picker-input,.throne-biz-date-range-picker-wrapper,${sdSelect},${sdDropdown}`;
  const label2 = (el) => {
    const clone2 = el.cloneNode(true);
    clone2.querySelectorAll(
      'svg,[role="img"],.ant-select-selection-item-remove,.el-tag__close,[aria-hidden="true"]'
    ).forEach((e) => e.remove());
    return text3(clone2.textContent);
  };
  function locate(spec) {
    const found = common.candidates({
      ...spec,
      roles: ["input", "textarea", "select", "combobox", "button", "date-group"]
    });
    if (!found.length) return null;
    const best = found.filter((x) => x.score === found[0].score);
    const located = best.map((meta) => {
      const semantic = common.resolve({ ...spec, identity: meta.identity });
      const input = semantic?.matches(".phoenix-select") ? semantic.querySelector("input") || semantic : semantic;
      return input ? { input, root: input.closest(componentSelector) || input, meta } : null;
    }).filter(Boolean);
    const roots = [...new Set(located.map((x) => x.root))];
    if (roots.length > 1) throw new Error("target_ambiguous");
    return located[0] || null;
  }
  const overlaysFor = (root, input, family) => {
    if (family === "job51-autocomplete") return document.activeElement === input ? Array.from(document.querySelectorAll(".ui-autocomplete")).filter(visible) : [];
    if (family === "guopin-path") {
      if (registry2.dictionaryOwner !== token(root)) return [];
      const placeholder = text3(root.querySelector(".ant-select-selection-placeholder")?.textContent);
      return Array.from(document.querySelectorAll('.my-cascader-modal[role="dialog"]')).filter((el) => visible(el) && (!placeholder || text3(el.querySelector(".title-search .ant-select-selection-placeholder")?.textContent) === placeholder));
    }
    if (family === "dayee-dictionary") {
      if (registry2.dictionaryOwner !== token(root)) return [];
      const school = /学校|院校/.test(input.getAttribute("placeholder") ?? "");
      return Array.from(document.querySelectorAll('[role="dialog"]')).filter((el) => visible(el) && Boolean(el.querySelector(school ? '.search-bar input[placeholder*="\u5B66\u6821"]' : '.search-bar input[placeholder*="\u4E13\u4E1A"]')));
    }
    if (family === "phoenix-autocomplete") {
      return document.activeElement === input && !document.querySelector(".phoenix-select--active") ? Array.from(document.querySelectorAll(".common-unmodeled-layer__layerContent")).filter(visible) : [];
    }
    if (family.startsWith("phoenix-")) {
      if (!root.matches(".phoenix-select--active")) return [];
      const active = Array.from(document.querySelectorAll(".phoenix-select--active")).filter(visible);
      return active.length === 1 && active[0] === root ? Array.from(document.querySelectorAll(".common-unmodeled-layer__layerContent")).filter(visible) : [];
    }
    if (family === "sd-select" || family === "sd-date") {
      const owner = root.closest(sdDropdown);
      return owner ? Array.from(owner.querySelectorAll('[class^="sd-Dropdown-dropdown-"],[class*=" sd-Dropdown-dropdown-"]')).filter((el) => visible(el) && el.closest(sdDropdown) === owner) : [];
    }
    const selector = family === "ant-date" ? ".ant-picker-dropdown,.ant-calendar-picker-container" : family === "el-date" ? ".el-picker-panel,.el-picker__popper" : family === "ant-path" || family === "ant-select" ? ".ant-select-dropdown,.ant-cascader-menus" : family === "el-path" ? ".el-cascader__dropdown" : family === "ud-select" ? ".ud__select__dropdown" : family === "ud-date" ? ".ud__picker-date-panel" : family === "el-select" ? ".el-select__popper,.el-select-dropdown" : '[role="listbox"],[role="tree"],.popup[aria-label]';
    const all = Array.from(document.querySelectorAll(selector)).filter(visible).filter(
      (el) => !el.parentElement?.closest(selector) || !visible(el.parentElement.closest(selector))
    );
    const controls = text3(
      `${input.getAttribute("aria-controls") || ""} ${input.getAttribute("aria-owns") || ""}`
    ).split(/\s+/).filter(Boolean);
    const owned = all.filter(
      (el) => root.contains(el) || controls.some((id3) => {
        const n = document.getElementById(id3);
        return n && (el === n || el.contains(n) || n.contains(el));
      })
    );
    return owned.length ? owned : all;
  };
  const monthNumber = (value) => {
    const words = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec"
    ];
    const chinese = ["\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u4E03", "\u516B", "\u4E5D", "\u5341", "\u5341\u4E00", "\u5341\u4E8C"];
    const normalized2 = text3(value).toLowerCase();
    const i = words.findIndex((x) => normalized2.startsWith(x));
    if (i >= 0) return i + 1;
    const cn = chinese.indexOf(normalized2.replace("\u6708", ""));
    if (cn >= 0) return cn + 1;
    const number3 = Number(normalized2.replace(/月|month/gi, ""));
    return number3 >= 1 && number3 <= 12 ? number3 : 0;
  };
  const calendar = (popup) => {
    const phoenix = popup.querySelector(".phoenix-calendar,.ant-calendar");
    if (phoenix) {
      const css = (s) => s.replaceAll("phoenix-calendar", phoenix.matches(".ant-calendar") ? "ant-calendar" : "phoenix-calendar");
      const yearPanel = Array.from(phoenix.querySelectorAll(css(".phoenix-calendar-year-panel"))).find(visible);
      const monthPanel = Array.from(phoenix.querySelectorAll(css(".phoenix-calendar-month-panel"))).find(visible);
      const panel = yearPanel || monthPanel || phoenix;
      const prefix = css(yearPanel ? "phoenix-calendar-year-panel" : monthPanel ? "phoenix-calendar-month-panel" : "phoenix-calendar");
      const mode = yearPanel ? "year" : monthPanel ? "month" : "date";
      const header = panel.querySelector(`.${prefix}-header`);
      const headerText = text3(header?.textContent);
      const cells = Array.from(panel.querySelectorAll(`.${prefix}-cell`)).filter(visible);
      const find = (selector) => token(Array.from(panel.querySelectorAll(css(selector))).find(visible));
      return [{
        mode,
        year: Number(headerText.match(/\d{4}/)?.[0] || 0),
        month: monthNumber(text3(panel.querySelector(css(".phoenix-calendar-month-select"))?.textContent)) || Number(headerText.match(/(\d{1,2})月/)?.[1] || 0),
        header: headerText,
        cells: cells.map((cell) => ({
          token: token(cell),
          text: text3(cell.textContent),
          title: "",
          disabled: disabled(cell) || Boolean(cell.querySelector('[aria-disabled="true"]')),
          inView: !cell.matches(css(".phoenix-calendar-last-month-cell,.phoenix-calendar-next-month-btn-day,.phoenix-calendar-year-panel-last-decade-cell,.phoenix-calendar-year-panel-next-decade-cell")),
          selected: cell.className.includes("selected") || Boolean(cell.querySelector('[aria-selected="true"]')),
          month: mode === "month" ? monthNumber(text3(cell.textContent)) : 0
        })),
        yearButton: find(".phoenix-calendar-year-select,.phoenix-calendar-month-panel-year-select"),
        monthButton: find(".phoenix-calendar-month-select"),
        prev: find(yearPanel ? ".phoenix-calendar-year-panel-prev-decade-btn" : monthPanel ? ".phoenix-calendar-month-panel-prev-year-btn" : ".phoenix-calendar-prev-year-btn"),
        next: find(yearPanel ? ".phoenix-calendar-year-panel-next-decade-btn" : monthPanel ? ".phoenix-calendar-month-panel-next-year-btn" : ".phoenix-calendar-next-year-btn"),
        prevMonth: find(".phoenix-calendar-prev-month-btn"),
        nextMonth: find(".phoenix-calendar-next-month-btn")
      }];
    }
    const sd = (prefix) => `[class^="${prefix}-"],[class*=" ${prefix}-"]`;
    const sdPanel = popup.matches(sd("sd-panal-menu-wrapper")) ? popup : popup.querySelector(sd("sd-panal-menu-wrapper"));
    if (sdPanel) {
      const header = sdPanel.querySelector(sd("sd-basic-selector"));
      const cells = Array.from(sdPanel.querySelectorAll(sd("sd-basic-year-item"))).filter(visible);
      const arrows = header ? Array.from(header.querySelectorAll(sd("sd-basic-selector-icon"))).filter(visible) : [];
      const headerText = text3(header?.textContent);
      const mode = cells.length === 12 && cells.every((c) => monthNumber(text3(c.textContent)) > 0) ? "month" : cells.length > 0 && cells.every((c) => /^\d{4}$/.test(text3(c.textContent))) ? "year" : null;
      if (!header || arrows.length !== 2 || !mode) return [];
      return [{
        mode,
        year: Number(headerText.match(/\d{4}/)?.[0] || 0),
        month: 0,
        header: headerText,
        cells: cells.map((cell) => ({
          token: token(cell),
          text: text3(cell.textContent),
          title: "",
          disabled: disabled(cell) || Boolean(cell.closest(sd("sd-basic-disabled"))),
          inView: true,
          selected: Boolean(cell.closest(sd("sd-basic-selected"))),
          month: mode === "month" ? monthNumber(text3(cell.textContent)) : 0
        })),
        yearButton: null,
        monthButton: null,
        prev: token(arrows[0]),
        next: token(arrows[1]),
        prevMonth: null,
        nextMonth: null
      }];
    }
    if (popup.matches(".ud__picker-date-panel")) {
      const header = popup.querySelector(".ud__picker-panel-header");
      const cells = Array.from(popup.querySelectorAll(".ud__picker__cell")).filter(visible);
      const mode = cells.some((cell) => cell.matches(".ud__picker-year-panel-cell")) ? "year" : cells.some((cell) => cell.matches(".ud__picker-month-panel-cell")) ? "month" : null;
      if (!mode || !header) return [];
      const headerText = text3(header.textContent);
      const navigation = Array.from(header.querySelectorAll(".ud__picker-panel-header-icon:not(.ud__picker-panel-header-collapse)")).filter(visible);
      if (navigation.length !== 2) return [];
      return [{
        mode,
        year: Number(headerText.match(/\d{4}/)?.[0] || 0),
        month: 0,
        header: headerText,
        cells: cells.map((cell) => ({
          token: token(cell),
          text: text3(cell.textContent),
          title: cell.getAttribute("title") || "",
          disabled: disabled(cell),
          inView: true,
          selected: cell.matches(".ud__picker__cell-selected") || cell.getAttribute("aria-selected") === "true",
          month: mode === "month" ? monthNumber(text3(cell.textContent)) : 0
        })),
        yearButton: token(header.querySelector(".ud__picker-panel-header-btn")),
        monthButton: null,
        prev: token(navigation[0]),
        next: token(navigation[1]),
        prevMonth: null,
        nextMonth: null
      }];
    }
    const ant = popup.matches(".ant-picker-dropdown");
    const panels = Array.from(
      popup.querySelectorAll(
        ant ? ".ant-picker-panel" : ".el-date-range-picker__content,.el-date-picker__body"
      )
    ).filter(visible);
    const list = panels.length ? panels : [popup];
    return list.map((panel) => {
      const table = Array.from(panel.querySelectorAll("table")).find(visible);
      if (!table) return null;
      const mode = table.matches(".el-year-table") || table.closest(".ant-picker-year-panel") ? "year" : table.matches(".el-month-table") || table.closest(".ant-picker-month-panel") ? "month" : table.closest(".ant-picker-decade-panel") ? "decade" : "date";
      const header = panel.querySelector(
        ".ant-picker-header,.el-date-picker__header,.el-date-range-picker__header"
      ) || popup.querySelector(".el-date-picker__header");
      const headerText = text3(header?.textContent);
      const years = headerText.match(/\d{4}/g)?.map(Number) || [];
      const year = years[0] || 0;
      const monthLabel = header?.querySelector(".ant-picker-month-btn") || header?.querySelectorAll(".el-date-picker__header-label")[1];
      let month3 = monthNumber(text3(monthLabel?.textContent));
      if (!month3) {
        const word = headerText.match(
          /January|February|March|April|May|June|July|August|September|October|November|December/i
        );
        if (word) month3 = monthNumber(word[0]);
      }
      if (!month3 && mode === "date") {
        const selected = table.querySelector("td.ant-picker-cell-in-view[title]");
        month3 = Number(selected?.getAttribute("title")?.split("-")[1] || 0);
      }
      if (!month3 && mode === "date") {
        const m = headerText.match(/\d{4}\s*年\s*(\d{1,2})\s*月/);
        if (m) month3 = Number(m[1]);
      }
      const cells = Array.from(table.querySelectorAll("td")).filter(visible).map((td) => ({
        token: token(td.querySelector("button,a,.cell") || td),
        text: text3(td.textContent),
        title: td.getAttribute("title") || "",
        disabled: disabled(td),
        inView: ant ? td.classList.contains("ant-picker-cell-in-view") : !td.matches(".prev-month,.next-month,.prev-year,.next-year"),
        selected: td.getAttribute("aria-selected") === "true" || td.matches(
          ".ant-picker-cell-selected,.ant-picker-cell-range-start,.ant-picker-cell-range-end,.current,.today.selected,.start-date,.end-date"
        ),
        month: mode === "month" ? monthNumber(text3(td.textContent)) : 0
      }));
      const find = (selector) => token(
        Array.from((header || panel).querySelectorAll(selector)).find(
          (el) => visible(el) && !disabled(el)
        )
      );
      return {
        mode,
        year,
        month: month3,
        header: headerText,
        cells,
        yearButton: ant ? find(".ant-picker-year-btn") : token(header?.querySelectorAll(".el-date-picker__header-label")[0]),
        monthButton: ant ? find(".ant-picker-month-btn") : token(header?.querySelectorAll(".el-date-picker__header-label")[1]),
        prev: find(".ant-picker-header-super-prev-btn,button.d-arrow-left"),
        next: find(".ant-picker-header-super-next-btn,button.d-arrow-right"),
        prevMonth: find(".ant-picker-header-prev-btn,button.arrow-left"),
        nextMonth: find(".ant-picker-header-next-btn,button.arrow-right")
      };
    }).filter(Boolean);
  };
  function read(spec) {
    const target = locate(spec);
    if (!target) return null;
    const { input, root, meta } = target;
    const sdField = root.closest('[class^="apply-field-"],[class*=" apply-field-"],[class^="field-"],[class*=" field-"]');
    const sdDismiss = sdField && Array.from(sdField.children).find((el) => /^(?:title|filed-title|field-title)-/.test(el.className) && !el.matches('button,a,input,label,[role="button"]') && !el.querySelector('button,a,input,select,textarea,[role="button"]'));
    const dateGroup = common.dateGroup(input);
    const family = meta.plannerFamily === "guopin" && meta.scope === "\u8D44\u683C\u8BC1\u4E66" && root.matches(".my-cascader-modal[role=dialog]") ? "guopin-certificates" : meta.plannerFamily === "guopin" && root.closest(".cascader-modal-field") ? "guopin-path" : meta.plannerFamily === "job51" && meta.inputMode === "date" && input instanceof HTMLInputElement && input.readOnly && /setday\(this\)/.test(input.getAttribute("onfocus") ?? "") ? "my97-date" : meta.plannerFamily === "job51" && root.matches(".custom-combobox") ? "job51-autocomplete" : meta.plannerFamily === "dayee" && meta.inputMode === "choice" && input instanceof HTMLInputElement && root === input ? "dayee-dictionary" : root.matches(".ant-radio-group") ? "ant-radio" : root.matches(".phoenix-auto-complete-container") ? "phoenix-autocomplete" : root.matches(".phoenix-radio-group") ? "phoenix-radio" : root.matches(".phoenix-select") ? meta.inputMode === "date" ? "phoenix-date" : "phoenix-select" : root.matches(".ant-picker,.ant-calendar-picker") ? "ant-date" : root.matches(".throne-biz-date-range-picker-wrapper,.throne-biz-date-range-picker-input") ? "ud-date" : root.matches(".ud__select") && root.querySelector(".ud__select__selector") ? "ud-select" : root.matches(sdDropdown) && input.closest("label.day_info") ? "sd-date" : root.matches(".el-date-editor") ? "el-date" : root.matches(".ant-cascader") ? "ant-path" : root.matches(".el-cascader") ? "el-path" : root.matches(".ant-select") ? "ant-select" : root.matches(".el-select") ? "el-select" : root.matches(`${sdSelect},${sdDropdown}`) ? "sd-select" : "native";
    let candidates = family === "guopin-certificates" ? [root] : overlaysFor(root, input, family);
    if (family.startsWith("phoenix-") && spec.popupToken && !candidates.length && !root.matches(".phoenix-select--active")) {
      const closing2 = element(spec.popupToken);
      if (closing2 && visible(closing2) && !document.querySelector(".phoenix-select--active")) candidates = [closing2];
    }
    if (spec.popupToken) {
      const old = element(spec.popupToken);
      if (old && candidates.includes(old)) candidates = [old];
    }
    if (candidates.length > 1) throw new Error("overlay_ambiguous");
    const popup = candidates[0];
    const expanded = input.getAttribute("aria-expanded") === "true" || root.classList.contains("phoenix-select--active") || family.startsWith("phoenix-") && Boolean(popup) || ["dayee-dictionary", "guopin-path", "guopin-certificates", "job51-autocomplete"].includes(family) && Boolean(popup) || root.classList.contains("ant-select-open") || root.classList.contains("ud__select-open") || root.classList.contains("is-opened") || Boolean(popup) && family.endsWith("-date") && (root.classList.contains("ant-picker-focused") || root.matches(".ant-calendar-picker") && popup?.contains(document.activeElement));
    const explicitlyClosed = input.hasAttribute("aria-expanded") && input.getAttribute("aria-expanded") === "false";
    const attached = (!explicitlyClosed || family === "guopin-path") && Boolean(
      popup && (root.contains(popup) || family === "sd-select" && root.closest(sdDropdown)?.contains(popup) || root.contains(document.activeElement) || expanded || spec.popupToken)
    );
    const overlay = attached ? popup : void 0;
    const inputs2 = Array.from(
      root.querySelectorAll("input:not([type=hidden])")
    );
    if (input instanceof HTMLInputElement && !inputs2.includes(input)) inputs2.push(input);
    const tags = Array.from(root.querySelectorAll(family === "guopin-certificates" ? ".flat-foot .select-list .select-item" : ".phoenix-select__tag,.ant-select-selection-item,.el-tag__content,.ud__select__selector__tag .ud__tag__content")).filter(visible).map(label2).filter(Boolean);
    let value = meta.value || "";
    if (family.endsWith("-date") && family !== "phoenix-date") value = inputs2.map((x) => family === "sd-date" ? x.value.replace(/\s*[（(]\d+岁[）)]$/, "") : x.value).join(" / ");
    const optionLabel = (e) => label2(
      (["guopin-path", "guopin-certificates"].includes(family) ? e.querySelector(".item-txt") : null) || e.querySelector(
        `.ant-select-item-option-content,.ant-cascader-menu-item-content,.el-cascader-node__label,.ud__select__list__item__content,.ud__tree__node__label,.area-text-label,.item-text-label,.phoenix-selectList__singleLabel,.phoenix-radio__radio-text,${sdItem}`
      ) || e
    );
    const option = (e) => ({
      token: token(e),
      label: optionLabel(e),
      disabled: disabled(e) || Boolean(e.querySelector("input[type=checkbox]:disabled")),
      selected: ["guopin-path", "guopin-certificates"].includes(family) && e.matches(".leaf-item.active") || Boolean(e.querySelector("input[type=checkbox]")?.checked) || e.getAttribute("aria-selected") === "true" || e.getAttribute("aria-checked") === "true" || Boolean(e.closest('[class^="sd-Menu-container-"],[class*=" sd-Menu-container-"]')?.getAttribute("aria-selected") === "true") || e.matches(
        ".phoenix-radio--checked,.phoenix-selectList__listItem--selected,.ant-cascader-menu-item-active,.el-cascader-node.in-active-path,.el-cascader-node.is-active,.el-select-dropdown__item.is-selected,.ud__select__list__item-selected"
      ),
      branch: Boolean(
        e.querySelector(".ant-cascader-menu-item-expand-icon,.el-cascader-node__postfix")
      ) || e.hasAttribute("aria-expanded"),
      loading: e.className.toString().includes("loading") || Boolean(e.querySelector(".is-loading")),
      check: token(
        e.querySelector(".el-radio__inner,.el-checkbox__inner,.ud__checkbox") || e.querySelector("input[type=radio],input[type=checkbox]")
      ),
      leaf: e.getAttribute("aria-expanded") === "false"
    });
    const columns = overlay ? Array.from(overlay.querySelectorAll(`.ant-cascader-menu,.el-cascader-menu,${sdMenu}`)).filter(visible).map(
      (column) => Array.from(
        column.querySelectorAll(
          `.ant-cascader-menu-item,.el-cascader-node,[role=menuitemcheckbox],[role=treeitem],${sdItem}`
        )
      ).filter((e) => visible(e) && (!column.matches(sdMenu) || e.closest(sdMenu) === column)).map(option)
    ) : [];
    const componentOptions = overlay ? Array.from(
      overlay.querySelectorAll('.phoenix-selectList__listItem,.ant-select-item-option,.ant-select-dropdown-menu-item,.el-select-dropdown__item,.ud__select__list__item,.ud__tree__node:has(input[type=checkbox]),[class^="sd-Select-common-item-"],[class*=" sd-Select-common-item-"]')
    ).filter(visible) : [];
    let options = (componentOptions.length ? componentOptions : overlay ? Array.from(overlay.querySelectorAll("[role=option]")).filter(visible) : []).map(option);
    if (family === "job51-autocomplete" && overlay) options = Array.from(overlay.querySelectorAll(".ui-menu-item")).filter(visible).map(option);
    if (family === "ant-radio") options = Array.from(root.querySelectorAll(".ant-radio-wrapper,.ant-radio-button-wrapper")).filter(visible).map(option);
    if (family === "dayee-dictionary" && overlay) options = Array.from(overlay.querySelectorAll(".school-item")).filter(visible).map(option);
    if (family === "phoenix-radio") options = Array.from(root.querySelectorAll(".phoenix-radio")).filter(visible).map(option);
    if (!options.length && family === "sd-select" && columns.length === 1)
      options = columns[0];
    if (overlay && !options.length) {
      const containers = [
        overlay,
        ...Array.from(overlay.querySelectorAll("[role=listbox]"))
      ].filter((e) => e.matches("[role=listbox]"));
      options = containers.flatMap(
        (container) => Array.from(container.children).filter(visible).map(option)
      );
    }
    const scroll = overlay ? Array.from(
      overlay.querySelectorAll(
        '.phoenix-selectList__virtualList-holder,.rc-virtual-list-holder,.el-select-dropdown__wrap,.el-scrollbar__wrap,[role=listbox],[class^="sd-Select-scrollable-"],[class*=" sd-Select-scrollable-"]'
      )
    ).find((e) => visible(e) && e.scrollHeight > e.clientHeight + 2) : void 0;
    const area = family === "phoenix-select" ? overlay?.querySelector(".area-selector-container,.constant-main-selector-container") : null;
    const confirm = overlay ? Array.from(
      overlay.querySelectorAll(
        `.ant-picker-ok button,.el-picker-panel__footer button,.ant-cascader-footer button${family === "sd-select" || ["dayee-dictionary", "guopin-path", "guopin-certificates"].includes(family) ? ",button,[role=button]" : family === "phoenix-select" ? ",.phoenix-button" : ""}`
      )
    ).filter((e) => visible(e) && !disabled(e) && (family === "dayee-dictionary" ? /^(选择|确定)$/ : /^(ok|确定|确认)$/i).test(norm(e.textContent))) : [];
    const clear = root.querySelector(
      ".ant-select-clear,.el-select__clear,.el-input__clear,.ant-picker-clear"
    );
    const panels = overlay && family.endsWith("-date") ? calendar(overlay) : [];
    const customRoot = family === "sd-select" ? overlay?.querySelector('[class^="custom-option-"],[class*=" custom-option-"]') : null;
    const customButtons = customRoot ? Array.from(customRoot.querySelectorAll("button")).filter((e) => visible(e) && !disabled(e)) : [];
    const customInputs = customRoot ? Array.from(customRoot.querySelectorAll("input:not([type=hidden])")).filter(visible) : [];
    const customEntry = customButtons.filter((e) => /^添加(?:学校|专业)(?:全称|名称)$/.test(text3(e.textContent)));
    const customConfirm = customButtons.filter((e) => /^(添加|确定)$/.test(text3(e.textContent)));
    registry2.capabilities ??= /* @__PURE__ */ new WeakMap();
    const hint = `${input.getAttribute("placeholder")}|${input.getAttribute("size")}`;
    let capability = registry2.capabilities.get(root);
    if (!capability || capability.hint !== hint)
      capability = { hint, precision: null, awaitOpening: false };
    const activeEndpoint = inputs2.indexOf(document.activeElement);
    if (activeEndpoint >= 0) capability.activeEndpoint = activeEndpoint;
    if (family === "ud-date" && inputs2.some((x) => x.value) && inputs2.every((x) => !x.value || /^\d{4}[-/]\d{2}$/.test(x.value))) capability.precision = "month";
    if (!expanded && !overlay) capability.awaitOpening = true;
    if (panels.length && capability.awaitOpening) {
      const mode = panels[0].mode;
      if (mode === "date" || mode === "month") capability.precision = mode;
      capability.awaitOpening = false;
    }
    registry2.capabilities.set(root, capability);
    return {
      family,
      ...["guopin-path", "guopin-certificates"].includes(family) ? { guopinPath: { tabs: Array.from(overlay?.querySelectorAll(".flat-left [role=tab]") ?? []).filter(visible).map(option), parents: Array.from(overlay?.querySelectorAll(".flat-left .level-item") ?? []).filter(visible).map(option), leaves: Array.from(overlay?.querySelectorAll(".flat-leaf .leaf-item") ?? []).filter(visible).map(option), path: Array.from(overlay?.querySelectorAll(".label-path .path-item > span:first-child") ?? []).map((el) => text3(el.textContent)), close: token(overlay?.querySelector(".ant-modal-close")) } } : {},
      ...family === "job51-autocomplete" && meta.relatedFields?.length ? { companion: { input: token(input.closest("dl")?.nextElementSibling?.querySelector("dd input:not([type=hidden])")), value: input.closest("dl")?.nextElementSibling?.querySelector("dd input:not([type=hidden])")?.value ?? "", otherLabel: /专业/.test(meta.label) ? "\u5176\u4ED6\u4E13\u4E1A" : "\u5176\u4ED6\u9662\u6821" } } : {},
      ...family === "dayee-dictionary" ? { dictionary: { search: token(overlay?.querySelector(".search-bar input")), cancel: token(overlay && Array.from(overlay.querySelectorAll("button")).find((el) => /^取消$/.test(norm(el.textContent)))) } } : {},
      ...input instanceof HTMLSelectElement ? { nativeOptions: Array.from(input.options).map((option2) => ({ label: text3(option2.textContent), value: option2.value, disabled: option2.disabled || Boolean(option2.closest("optgroup[disabled]")) })) } : {},
      ...["phoenix-autocomplete", "job51-autocomplete"].includes(family) ? { editing: meta.pendingInput } : {},
      ...area ? { pendingSelection: {
        search: token(area.querySelector(".area-search-input input,.content-search input")),
        selected: Array.from(area.querySelector(".select-data-container")?.children || []).filter((node) => !node.matches(".select-data-empty")).map(label2),
        options: Array.from(area.querySelectorAll(".area-item-container,.list-item-container")).filter(visible).map((node) => ({
          ...option(node),
          check: token(node.querySelector(".icon-container")),
          selected: Boolean(node.querySelector(".area-icon-CheckboxChecked,.CheckboxChecked"))
        }))
      } } : {},
      document: registry2.epoch,
      root: token(root),
      trigger: token(root.matches(".phoenix-select") ? root : root.querySelector(".el-select__wrapper,.ant-select-selector,.ant-select-selection,.ud__select__selector") || (family === "sd-select" && root.matches(sdSelect) ? root : input)),
      input: token(family === "phoenix-select" && overlay?.querySelector(".phoenix-selectList__searchWrapper input") || input),
      inputs: inputs2.map((x) => ({
        token: token(x),
        value: family === "phoenix-date" ? meta.value : family === "sd-date" ? x.value.replace(/\s*[（(]\d+岁[）)]$/, "") : x.value,
        type: x.type,
        readonly: x.readOnly,
        placeholder: x.placeholder
      })),
      label: meta.label,
      policyContext: meta.policyContext,
      scope: meta.scope,
      identity: meta.identity,
      ...dateGroup ? { splitDate: {
        parts: dateGroup.parts.map((part) => ({ label: part.meta.label, identity: part.meta.identity, value: part.meta.value, disabled: part.meta.disabled, invalid: part.meta.invalid, endpoint: part.endpoint, part: part.part })),
        current: dateGroup.current ? { token: token(dateGroup.current.element), checked: dateGroup.current.checked, disabled: dateGroup.current.disabled } : null
      } } : {},
      value,
      tags,
      disabled: meta.disabled || disabled(root),
      readonly: meta.readonly,
      constraints: meta.constraints,
      invalid: meta.invalid,
      checked: meta.checked,
      popupToken: overlay ? token(overlay) : null,
      popupReady: Boolean(
        overlay && Number(getComputedStyle(overlay).opacity || 1) > 0.98 && ![overlay, overlay.parentElement].filter((node) => Boolean(node && node !== document.body)).some(
          (node) => typeof node.getAnimations === "function" && node.getAnimations().some(
            (animation) => animation.playState === "running" && animation.effect?.getComputedTiming().iterations !== Infinity
          )
        )
      ),
      expanded: expanded || Boolean(overlay),
      ...capability.activeEndpoint !== void 0 ? { activeEndpoint: capability.activeEndpoint } : {},
      calendar: panels,
      precision: capability.precision,
      hasTime: Boolean(overlay?.querySelector(".ant-picker-time-panel,.el-time-panel")),
      columns,
      options,
      confirm: confirm.length === 1 ? token(confirm[0]) : null,
      clear: token(clear),
      dismiss: root.matches(".ant-calendar-picker") ? token(root.closest(".form-cell")?.querySelector(":scope > .tit-wrap .tit > p")) : family.startsWith("phoenix-") ? token(root.closest(".form-item--phoenix")?.querySelector(":scope > .form-item__title")) : family === "ud-date" || family === "ud-select" ? token(root.closest(".ud-formily-item")?.querySelector(":scope > .ud-formily-item-label")) : family.startsWith("sd-") ? token(sdDismiss) : null,
      ...customRoot ? { custom: {
        entry: customEntry.length === 1 ? token(customEntry[0]) : null,
        input: customInputs.length === 1 ? token(customInputs[0]) : null,
        confirm: customConfirm.length === 1 ? token(customConfirm[0]) : null
      } } : {},
      opaqueSelection: Boolean(
        Array.from(root.querySelectorAll(".ant-select-selection-overflow-item-rest")).some(
          visible
        )
      ) || tags.some((v) => /^\+\s*\d/.test(v)),
      multiple: family === "guopin-certificates" || root.matches(".ant-select-multiple,.phoenix-select--multi") || Boolean(root.querySelector(".ud__select__selector-multiple,.ud__select__selector__tag")) || Boolean(root.querySelector(".el-select__tags,.el-tag")) || Boolean(overlay?.querySelector(".el-select-dropdown.is-multiple")),
      scroll: scroll ? {
        token: token(scroll),
        top: scroll.scrollTop,
        height: scroll.clientHeight,
        total: scroll.scrollHeight
      } : null
    };
  }
  return { read, element, beginDictionary: (id3) => {
    if (Array.from(document.querySelectorAll('[role="dialog"]')).some(visible)) return false;
    registry2.dictionaryOwner = id3;
    return Boolean(element(id3));
  } };
}
function waitControlMutation(tokens, timeout) {
  return new Promise((resolve5) => {
    const registry2 = window[/* @__PURE__ */ Symbol.for("resume-companion.control-dom.v1")];
    const roots = tokens.map((id3) => registry2?.nodes.get(id3)?.deref()).filter((el) => Boolean(el?.isConnected));
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timer);
      for (const name of ["input", "change", "focusout"])
        document.removeEventListener(name, event, true);
      if (registry2) registry2.watchers = Math.max(0, (registry2.watchers || 1) - 1);
      resolve5();
    };
    const event = (event2) => {
      if (roots.some((root) => root.contains(event2.target))) finish();
    };
    const observer = new MutationObserver(finish);
    for (const root of roots)
      observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true
      });
    observer.observe(document.body, { childList: true });
    for (const name of ["input", "change", "focusout"])
      document.addEventListener(name, event, true);
    if (registry2) registry2.watchers = (registry2.watchers || 0) + 1;
    const timer = setTimeout(finish, Math.max(1, Math.min(timeout, 80)));
  });
}

// src/browser/controls/transaction.ts
var ControlFailure = class extends Error {
  constructor(code, phase) {
    super(`${code}: phase=${phase}`);
    this.code = code;
    this.phase = phase;
  }
  code;
  phase;
};
var ControlTransaction = class {
  constructor(external, timeout = 3e4) {
    this.external = external;
    this.deadline = Date.now() + timeout;
    this.signal = this.controller.signal;
    if (external?.aborted) this.abort();
    external?.addEventListener("abort", this.abort, { once: true });
    this.timer = setTimeout(
      () => this.controller.abort(new ControlFailure("operation_timeout", this.phase)),
      timeout
    );
  }
  external;
  signal;
  deadline;
  phase = "resolve";
  dispatched = false;
  actions = 0;
  progress = [];
  wake;
  controller = new AbortController();
  timer;
  abort = () => this.controller.abort(new ControlFailure("operation_cancelled", this.phase));
  check(phase = this.phase) {
    this.phase = phase;
    if (this.signal.aborted) throw this.signal.reason;
    if (Date.now() >= this.deadline) throw new ControlFailure("operation_timeout", phase);
  }
  start() {
    this.check();
    if (++this.actions > 80) throw new ControlFailure("action_budget_exceeded", this.phase);
    this.dispatched = true;
  }
  async pause(ms = 60) {
    this.check();
    await new Promise((resolve5, reject) => {
      const finish = () => {
        this.signal.removeEventListener("abort", abort);
        resolve5();
      };
      const timer = setTimeout(finish, Math.min(ms, this.deadline - Date.now()));
      const abort = () => {
        clearTimeout(timer);
        reject(this.signal.reason);
      };
      this.signal.addEventListener("abort", abort, { once: true });
    });
    this.check();
  }
  async wait(read, accept, phase, timeout = 5e3) {
    this.check(phase);
    const deadline = Math.min(this.deadline, Date.now() + timeout);
    do {
      this.check();
      try {
        const value = await read();
        if (accept(value)) return value;
      } catch (error2) {
        if (!(error2 instanceof ControlFailure) || error2.code !== "target_unresolved") throw error2;
      }
      if (this.wake) await this.wake();
      else await this.pause();
    } while (Date.now() < deadline);
    throw new ControlFailure("postcondition_timeout", phase);
  }
  close() {
    clearTimeout(this.timer);
    this.external?.removeEventListener("abort", this.abort);
  }
};
async function fencedLocatorAction(locator, signal, action, onStart, handles = []) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const pending = /* @__PURE__ */ new Set();
  const restore = [];
  let started = false;
  const cancel = () => controller.abort(signal?.reason);
  const dispatch = () => {
    try {
      signal?.throwIfAborted();
      if (started) throw new ControlFailure("action_result_unknown", "action_retry");
      onStart();
      started = true;
    } catch (error2) {
      controller.abort(error2);
      throw error2;
    }
  };
  for (const handle of handles)
    for (const method of [
      "evaluate",
      "focus",
      "type",
      "click",
      "select",
      "hover",
      "press",
      "scrollIntoView"
    ]) {
      const original = handle[method];
      if (typeof original !== "function") continue;
      const descriptor = Object.getOwnPropertyDescriptor(handle, method);
      Object.defineProperty(handle, method, {
        configurable: true,
        writable: true,
        value: function(...args) {
          let command;
          try {
            command = Promise.resolve(original.apply(this, args));
          } catch (error2) {
            if (started) controller.abort(error2);
            throw error2;
          }
          pending.add(command);
          void command.then(
            () => pending.delete(command),
            (error2) => {
              pending.delete(command);
              if (started) controller.abort(error2);
            }
          );
          return command;
        }
      });
      restore.push(() => {
        if (descriptor) Object.defineProperty(handle, method, descriptor);
        else delete handle[method];
      });
    }
  signal?.addEventListener("abort", cancel, { once: true });
  locator.on?.("action", dispatch);
  try {
    await action(locator, { signal: controller.signal });
    signal?.throwIfAborted();
  } catch (error2) {
    if (signal?.aborted) throw signal.reason;
    throw error2;
  } finally {
    while (pending.size) await Promise.allSettled([...pending]);
    locator.off?.("action", dispatch);
    signal?.removeEventListener("abort", cancel);
    for (const reset of restore.reverse()) reset();
  }
}

// src/browser/controls/verify.ts
function parseCalendarValue(value) {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]), month3 = Number(match[2]), day = match[3] === void 0 ? void 0 : Number(match[3]);
  if (year < 1 || month3 < 1 || month3 > 12) return null;
  const days = new Date(Date.UTC(year === 1 ? 2001 : year, month3, 0)).getUTCDate();
  if (day !== void 0 && (day < 1 || day > days)) return null;
  return {
    year,
    month: month3,
    ...day === void 0 ? {} : { day },
    iso: value,
    precision: day === void 0 ? "month" : "date"
  };
}
function readCalendarText(value) {
  const match = /^\s*(\d{4})\s*[-/年.]\s*(\d{1,2})(?:\s*[-/月.]\s*(\d{1,2})\s*日?)?\s*月?\s*$/.exec(
    value
  );
  if (!match) return null;
  const iso = `${match[1]}-${match[2].padStart(2, "0")}${match[3] ? `-${match[3].padStart(2, "0")}` : ""}`;
  return parseCalendarValue(iso)?.iso ?? null;
}
function sameValue(actual, expected) {
  return actual.normalize("NFC").trim() === expected.normalize("NFC").trim();
}
function datePartNumber(value, part) {
  const match = (part === "year" ? /^(\d{1,4})\s*年?$/ : /^(\d{1,2})\s*月?$/).exec(value.trim());
  if (!match) return null;
  const number3 = Number(match[1]);
  return number3 >= 1 && number3 <= (part === "month" ? 12 : 9999) ? number3 : null;
}
function samePath(actual, expected) {
  return actual.length === expected.length && actual.every((part, index) => sameValue(part, expected[index]));
}
function sameSet(actual, expected) {
  return actual.length === expected.length && new Set(actual).size === actual.length && expected.every((value) => actual.includes(value));
}

// src/browser/pointer-target.ts
async function preparePointerTarget(handle) {
  const nativeOption = await handle.evaluate((el) => el.tagName === "OPTION");
  if (nativeOption) return;
  await handle.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
  let previous = "";
  for (let i = 0; i < 12; i++) {
    const probe = await handle.evaluate((el) => {
      if (!el.isConnected) throw new Error("target_detached_before_click");
      const rect = el.getBoundingClientRect();
      let x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      let doc = el.ownerDocument, expected = el;
      let hit = rect.width > 0 && rect.height > 0;
      try {
        while (hit) {
          const top = doc.elementFromPoint(x, y);
          hit = Boolean(top && (top === expected || expected.contains(top)));
          const host2 = doc.defaultView?.frameElement;
          if (!host2) break;
          const box = host2.getBoundingClientRect();
          x += box.x + host2.clientLeft;
          y += box.y + host2.clientTop;
          expected = host2;
          doc = host2.ownerDocument;
        }
      } catch {
        hit = false;
      }
      return { hit, box: [rect.x, rect.y, rect.width, rect.height].join(",") };
    });
    if (probe.hit && probe.box === previous) return;
    previous = probe.box;
    await new Promise((resolve5) => setTimeout(resolve5, 50));
  }
  throw new Error("target_obscured: the requested control is covered; no click was dispatched");
}

// src/browser/manual-policy.ts
function manualReason(target) {
  const label2 = target.label.normalize("NFKC").replace(/\s+/g, "");
  const scope = (target.scope ?? "").normalize("NFKC").replace(/\s+/g, "");
  const context = `${target.scope ?? ""} ${target.policyContext ?? ""}`.normalize("NFKC").replace(/\s+/g, "");
  const text3 = `${label2} ${context}`;
  if (/^(保密|对这家公司隐藏我的信息|保密当前简历|开启智能推荐|默认投递简历)$/.test(label2)) return "privacy_setting";
  if (target.type === "file" || /上传|upload/i.test(label2)) return "attachment";
  if (/验证码|密码|verificationcode|password/i.test(label2) || target.type === "password") return "credential";
  if (/最终提交|提交申请|立即申请|确认投递|投递确认|删除|支付|submitapplication/i.test(label2)) return "irreversible_action";
  if (/声明|承诺|授权|签署|是否同意|同意提供|同意条款|隐私(?:政策|协议)|接受.*条款|consent|declaration|privacyagreement/i.test(text3)) return "consent";
  const relative = /亲属|亲戚|亲友|家属|配偶|近亲|直系血亲|relative|familymember|spouse/i;
  const employment = /受雇|任职|工作|就职|员工|雇员|聘用|employ|work/i;
  const employer = /本公司|本企业|本集团|本单位|本行|贵司|集团(?:系统)?|company|corporation|employer/i;
  if (relative.test(text3) && (employment.test(text3) && /是否|有无|are|does|doany/i.test(text3) || employer.test(text3))) return "employer_relatives";
  if (/亲属(?:任职|受雇|回避)|任职亲属|员工亲属|亲属员工|利益冲突|回避关系/.test(context)) return "employer_relatives";
  if (relative.test(label2) && /姓名|部门|单位|关系|职务|电话|name|department/i.test(label2) && !/^(家庭关系|家庭成员|家庭成员信息)(?:\/第\d+条)?$/.test(scope)) return "employer_relatives";
  return void 0;
}
function isManualTarget(label2, scope) {
  return manualReason({ label: label2, scope }) !== void 0;
}
function manualTasks(raw) {
  const tasks = [];
  const groups = /* @__PURE__ */ new Set();
  for (const f2 of raw.fields) {
    const reason = manualReason(f2);
    if (!reason || f2.disabled) continue;
    if (f2.choiceGroup) {
      const key2 = `${f2.frame}:${f2.choiceGroup.id}`;
      if (groups.has(key2)) continue;
      groups.add(key2);
    }
    const present = (f2.choiceGroup ? f2.choiceGroup.answered : f2.checked === null ? Boolean(f2.value) : f2.checked) && !f2.invalid;
    const state = reason === "attachment" ? "verification_required" : present ? "already_present" : "pending";
    const required2 = f2.choiceGroup?.required ?? f2.required;
    tasks.push({ frame: f2.frame, scope: f2.scope ?? "", field: f2.choiceGroup?.label || f2.label, reason, required: required2, state, blocks_navigation: required2 && state !== "already_present" });
  }
  for (const attachment of raw.attachments ?? []) {
    const state = attachment.state === "accepted_ui" ? "already_present" : attachment.state === "selected_unverified" ? "verification_required" : "pending";
    tasks.push({ ...attachment, reason: "attachment", state, blocks_navigation: attachment.required && state !== "already_present" });
  }
  for (const label2 of raw.workflow?.manual ?? []) {
    const existing = tasks.find((t) => t.field === label2);
    if (existing) {
      existing.required = true;
      existing.blocks_navigation = true;
      existing.state = "pending";
    } else tasks.push({ frame: 0, scope: raw.workflow.heading, field: label2, reason: manualReason({ label: label2 }) ?? "attachment", required: true, state: "pending", blocks_navigation: true });
  }
  return tasks;
}
function fieldMissing(f2) {
  return !f2.disabled && (f2.choiceGroup?.required ?? f2.required) && Boolean(f2.pendingInput || (f2.choiceGroup ? !f2.choiceGroup.answered : f2.checked === null ? !f2.value : !f2.checked));
}

// src/browser/controls/driver.ts
var readDom = new Function(
  "spec",
  `return (${createControlDom.toString()})((${createDomFormRuntime.toString()})()).read(spec);`
);
var getElement = new Function(
  "id",
  `return (${createControlDom.toString()})((${createDomFormRuntime.toString()})()).element(id);`
);
var beginDictionary = new Function("id", `return (${createControlDom.toString()})((${createDomFormRuntime.toString()})()).beginDictionary(id);`);
var ControlDriver = class _ControlDriver {
  constructor(page, spec, context) {
    this.page = page;
    this.spec = spec;
    this.tx = context.transaction ?? new ControlTransaction(context.signal, context.timeoutMs);
    this.url = page.url();
  }
  page;
  spec;
  tx;
  frame;
  popupToken;
  document;
  calendarProbes = [];
  url;
  async read() {
    this.tx.check();
    if (this.page.url() !== this.url) throw new ControlFailure("page_changed", this.tx.phase);
    const frames = this.frame ? [this.frame] : this.page.frames();
    const found = [];
    for (const [index, frame2] of frames.entries()) {
      if (!this.frame && this.spec.frame !== void 0 && index !== this.spec.frame) continue;
      let state2;
      try {
        state2 = await frame2.evaluate(readDom, {
          ...this.spec,
          ...this.popupToken ? { popupToken: this.popupToken } : {}
        });
      } catch (error2) {
        throw new ControlFailure(
          /ambiguous/.test(String(error2)) ? "target_ambiguous" : "target_unresolved",
          this.tx.phase
        );
      }
      if (state2) found.push({ frame: frame2, state: state2 });
    }
    if (found.length !== 1)
      throw new ControlFailure(
        found.length ? "target_ambiguous" : "target_unresolved",
        this.tx.phase
      );
    const { frame, state } = found[0];
    if (manualReason(state)) throw new ControlFailure("manual_boundary", "control_preflight");
    this.frame = frame;
    if (this.document && state.document !== this.document)
      throw new ControlFailure("page_changed", this.tx.phase);
    this.tx.wake = async () => {
      this.tx.check();
      await frame.evaluate(
        waitControlMutation,
        [state.root, ...state.popupToken ? [state.popupToken] : []],
        Math.min(60, this.tx.deadline - Date.now())
      );
      this.tx.check();
    };
    this.document = state.document;
    if (state.popupToken) this.popupToken = state.popupToken;
    return state;
  }
  async act(id3, kind = "click", value, expectedOption) {
    this.tx.check();
    if (!id3) throw new ControlFailure("unsupported_component", this.tx.phase);
    const js = await this.frame.evaluateHandle(getElement, id3);
    const handle = js.asElement();
    if (!handle) {
      await js.dispose();
      throw new ControlFailure("target_unresolved", this.tx.phase);
    }
    try {
      if (await handle.evaluate(
        (el) => Boolean(el.disabled || el.getAttribute("aria-disabled") === "true")
      ))
        throw new ControlFailure("constraint_violation", this.tx.phase);
      if (kind === "click" || kind === "hover") {
        await handle.scrollIntoView();
        let lastBox = "";
        let repositioned = false;
        await this.tx.wait(
          async () => {
            const sample = await handle.evaluate((el) => {
              const box = el.getBoundingClientRect();
              const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
              return {
                connected: el.isConnected,
                box: [box.x, box.y, box.width, box.height].join(","),
                ready: box.width > 0 && box.height > 0 && Boolean(hit && (hit === el || el.contains(hit)))
              };
            });
            if (!sample.ready && !repositioned) {
              repositioned = true;
              await handle.evaluate((el) => {
                const popup = el.closest('[class^="sd-Dropdown-dropdown-"],[class*=" sd-Dropdown-dropdown-"]');
                const owner = popup?.closest('[class^="sd-Dropdown-container-"],[class*=" sd-Dropdown-container-"]');
                if (popup && owner && getComputedStyle(popup).position === "fixed") {
                  const anchor = owner.getBoundingClientRect(), panel = popup.getBoundingClientRect();
                  const desired = panel.top < anchor.top ? innerHeight - anchor.height - 96 : 96;
                  let scroller = owner.parentElement;
                  while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /(auto|scroll)/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
                  (scroller ?? window).scrollBy({ top: anchor.top - desired, behavior: "instant" });
                } else el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
              });
              lastBox = "";
            }
            return sample;
          },
          (sample) => {
            if (!sample.connected) throw new ControlFailure("target_detached", "pointer_ready");
            const stable = sample.ready && lastBox === sample.box;
            lastBox = sample.box;
            return stable;
          },
          "pointer_ready"
        );
      }
      if (expectedOption !== void 0 && !await handle.evaluate((el, expected) => {
        const item = el.closest(
          ".area-item-container,.list-item-container,.ant-select-item-option,.el-select-dropdown__item,.ant-cascader-menu-item,.el-cascader-node,.ud__select__list__item,.ud__tree__node,[role=option],[role=menuitemcheckbox]"
        ) || el;
        const content = (item.matches(".my-cascader-modal .level-item") ? item.querySelector(".item-txt") : null) || item.querySelector(
          ".area-text-label,.item-text-label,.ant-select-item-option-content,.ant-cascader-menu-item-content,.el-cascader-node__label,.ud__select__list__item__content,.ud__tree__node__label"
        ) || item;
        const clone2 = content.cloneNode(true);
        clone2.querySelectorAll("svg,[role=img],[aria-hidden=true]").forEach((node) => node.remove());
        return (clone2.textContent || "").replace(/\s+/g, " ").trim() === expected;
      }, expectedOption))
        throw new ControlFailure("target_unresolved", "option_changed");
      this.tx.check();
      if (kind !== "fill") this.tx.start();
      if (kind === "click" || kind === "hover") {
        const point = await handle.clickablePoint();
        this.tx.check();
        if (kind === "click") await this.page.mouse.click(point.x, point.y);
        else await this.page.mouse.move(point.x, point.y);
      } else if (kind === "fill") {
        const calendarInput = await handle.evaluate(
          (el) => el instanceof HTMLInputElement && ["date", "month"].includes(el.type)
        );
        if (calendarInput) {
          this.tx.start();
          await handle.evaluate((el, next) => {
            if (el.disabled || el.readOnly) throw new Error("constraint_violation");
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
              el,
              next
            );
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }, String(value));
        } else if (await handle.evaluate((el) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
          await handle.focus();
          const prepared = await handle.evaluate((el) => {
            if (!el.isConnected || el !== document.activeElement || el.disabled || el.readOnly) return false;
            el.select();
            return !el.value || el.selectionStart === 0 && el.selectionEnd === el.value.length || el.ownerDocument.getSelection()?.toString() === el.value;
          });
          if (!prepared) throw new ControlFailure("selection_not_confirmed", "control_fill_prepare");
          this.tx.check();
          if (!await handle.evaluate((el) => el.isConnected && el === document.activeElement)) throw new ControlFailure("target_detached", "control_fill_prepare");
          this.tx.start();
          if (String(value)) await this.page.keyboard.sendCharacter(String(value));
          else await this.page.keyboard.press("Backspace");
        } else {
          const locator = handle.asLocator().setTimeout(Math.max(1, Math.min(4e3, this.tx.deadline - Date.now())));
          await fencedLocatorAction(
            locator,
            this.tx.signal,
            (runner, options) => runner.fill(String(value), options),
            () => this.tx.start(),
            [handle]
          );
        }
      } else if (kind === "press") await handle.press(String(value));
      else if (kind === "blur") await handle.evaluate((el) => el.blur());
      else
        await handle.evaluate((el, top) => {
          el.scrollTop = top;
        }, Number(value));
      this.tx.check();
    } finally {
      await handle.dispose();
    }
  }
  async actOption(label2, level, kind = "click", check2 = false, prefix = []) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const state = await this.ready(
        (s) => Boolean(
          (level === void 0 ? s.options : s.columns[level])?.some(
            (option2) => option2.label === label2
          )
        ),
        "option_ready"
      );
      this.checkPathPrefix(state, prefix);
      const options = (level === void 0 ? state.options : state.columns[level] || []).filter(
        (o) => o.label === label2
      );
      if (options.length !== 1 || options[0].disabled)
        throw new ControlFailure(
          options.length > 1 ? "option_ambiguous" : "constraint_violation",
          "option_ready"
        );
      const option = options[0];
      const actions = this.tx.actions;
      try {
        await this.act(check2 ? option.check || option.token : option.token, kind, void 0, label2);
        return;
      } catch (error2) {
        if (attempt || this.tx.actions !== actions || !(error2 instanceof ControlFailure) || !["target_unresolved", "target_detached"].includes(error2.code))
          throw error2;
      }
    }
  }
  async clickCustom(part) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const state = await this.ready((s) => Boolean(s.custom?.[part]), `custom_${part}`);
      const actions = this.tx.actions;
      try {
        await this.act(state.custom[part]);
        return;
      } catch (error2) {
        if (attempt || this.tx.actions !== actions || !(error2 instanceof ControlFailure) || !["target_unresolved", "target_detached"].includes(error2.code)) throw error2;
      }
    }
  }
  checkPathPrefix(state, prefix) {
    for (let index = 0; index < prefix.length; index++) {
      const column = state.columns[index] || [];
      const hasSelection = column.some((option) => option.selected);
      if (!column.some((option) => option.label === prefix[index] && !option.loading && (option.selected || state.family === "sd-select" && !hasSelection)))
        throw new ControlFailure("path_prefix_changed", "path_verify");
    }
  }
  result(status, matched, extra = {}) {
    return { ok: true, status, verification: { level: "ui", matched }, ...extra };
  }
  protect(state, wanted, overwrite = false, date5 = false) {
    if (state.disabled) throw new ControlFailure("constraint_violation", "preflight");
    const actual = date5 ? readCalendarText(state.value) : state.value;
    if (actual && sameValue(actual, wanted)) return this.result("unchanged", true);
    if (state.value && !/^(请选择.*|选择.*|未选择.*|尚未选择.*|打开.*|please.*|select.*)$/i.test(state.value) && !overwrite)
      return this.result("preserved", false, { reason: "existing_value" });
    return null;
  }
  async ready(predicate, phase) {
    let previous = "";
    let stableSince = 0;
    return await this.tx.wait(
      () => this.read(),
      (state) => {
        if (!state.popupReady || !predicate(state)) {
          previous = "";
          return false;
        }
        const signature = JSON.stringify([
          state.popupToken,
          state.columns,
          state.options,
          state.pendingSelection,
          state.scroll
        ]);
        if (previous !== signature) stableSince = Date.now();
        const stable = previous === signature && Date.now() - stableSince >= 40;
        previous = signature;
        return stable;
      },
      phase
    );
  }
  async calendarReady() {
    let previous = "";
    return await this.tx.wait(
      () => this.read(),
      (state) => {
        const signature = JSON.stringify([state.popupToken, state.calendar]);
        const stable = state.popupReady && state.calendar.length > 0 && previous === signature;
        this.calendarProbes.push({ ready: state.popupReady, expanded: state.expanded, mode: state.calendar[0]?.mode, cells: state.calendar[0]?.cells.length ?? 0, stable });
        if (this.calendarProbes.length > 8) this.calendarProbes.shift();
        if (!state.popupReady || !state.calendar.length) {
          previous = "";
          return false;
        }
        previous = signature;
        return stable;
      },
      "date_panel_ready"
    );
  }
  async openDate(endpoint2 = 0) {
    let state = await this.read();
    if ((state.family === "sd-date" || state.family === "phoenix-date") && state.expanded) return await this.calendarReady();
    if (state.family === "ud-date" && state.expanded) {
      if (state.activeEndpoint === endpoint2) return await this.calendarReady();
      await this.closeDate(state, state.activeEndpoint ?? 0);
      state = await this.read();
    }
    this.tx.check("date_open");
    await this.act(state.inputs[endpoint2].token);
    return await this.calendarReady();
  }
  async closeDate(state, endpoint2 = 0) {
    await this.act(state.inputs[endpoint2].token, "press", "Escape");
    if (state.family === "ud-date" || state.family === "sd-date" || state.family === "phoenix-date" || state.family === "ant-date" && state.dismiss) {
      await this.tx.pause(40);
      const after = await this.read();
      if (after.expanded && after.dismiss) await this.act(after.dismiss);
    }
    await this.tx.wait(() => this.read(), (s) => !s.expanded, "date_closed");
  }
  async navigateCalendar(value, select, endpoint2 = 0) {
    const wanted = parseCalendarValue(value);
    for (let navigation = 0; navigation < 40; navigation++) {
      this.tx.check("date_navigate");
      const state = await this.calendarReady();
      if (!state.calendar.length) throw new ControlFailure("overlay_closed", "date_navigate");
      const calendar = state.calendar.find(
        (c) => c.year === wanted.year && (wanted.precision === "month" || c.month === wanted.month)
      ) || state.calendar[endpoint2 ? Math.min(endpoint2, state.calendar.length - 1) : 0];
      let action = null;
      let final = false;
      let selected = false;
      if (calendar.mode === "year") {
        const cell = calendar.cells.find((c) => c.inView && Number(c.text) === wanted.year);
        if (cell) {
          if (cell.disabled) throw new ControlFailure("constraint_violation", "date_year");
          action = cell.token;
        } else action = wanted.year < calendar.year ? calendar.prev : calendar.next;
      } else if (calendar.mode === "month") {
        if (calendar.year !== wanted.year)
          action = (select ? calendar.yearButton : null) || (wanted.year < calendar.year ? calendar.prev : calendar.next);
        else {
          const cell = calendar.cells.find((c) => c.month === wanted.month);
          if (!cell || cell.disabled)
            throw new ControlFailure("constraint_violation", "date_month");
          action = cell.token;
          final = wanted.precision === "month";
          selected = cell.selected;
        }
      } else if (calendar.mode === "date") {
        if (calendar.year !== wanted.year)
          action = (select ? calendar.yearButton : null) || (wanted.year < calendar.year ? calendar.prev : calendar.next);
        else if (calendar.month !== wanted.month)
          action = (select ? calendar.monthButton : null) || (wanted.month < calendar.month ? calendar.prevMonth : calendar.nextMonth);
        else {
          const cell = calendar.cells.find(
            (c) => c.inView && (c.title === value || Number(c.text) === wanted.day)
          );
          if (!cell || cell.disabled) throw new ControlFailure("constraint_violation", "date_day");
          action = cell.token;
          final = true;
          selected = cell.selected;
        }
      } else throw new ControlFailure("unsupported_component", "date_panel");
      const previous = JSON.stringify(state.calendar.map((c) => [c.mode, c.header]));
      if (final && !select) {
        if (!selected)
          throw new ControlFailure("postcondition_failed", "calendar_selection_verify");
        return;
      }
      await this.act(action);
      if (final) {
        this.tx.check("date_commit");
        await this.tx.pause(80);
        const after = await this.read();
        if (after.confirm) await this.act(after.confirm);
        return;
      }
      await this.tx.wait(
        () => this.read(),
        (s) => JSON.stringify(s.calendar.map((c) => [c.mode, c.header])) !== previous,
        "date_panel_change"
      );
      if (navigation === 39) throw new ControlFailure("action_budget_exceeded", "date_navigate");
    }
  }
  async my97Frame() {
    const found = [];
    for (const frame of this.page.frames()) {
      if (!/\/My97DatePicker\/My97DatePicker\.htm(?:[?#]|$)/i.test(frame.url())) continue;
      const host2 = await frame.frameElement();
      try {
        if (host2 && await host2.evaluate((el) => {
          for (let p = el; p; p = p.parentElement) {
            const style = getComputedStyle(p);
            if (style.display === "none" || style.visibility === "hidden" || p.hidden) return false;
          }
          const box = el.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0;
        })) found.push(frame);
      } finally {
        await host2?.dispose();
      }
    }
    if (found.length > 1) throw new ControlFailure("overlay_ambiguous", "my97_probe");
    return found[0] ?? null;
  }
  async setMy97Date(value) {
    const wanted = parseCalendarValue(value);
    if (wanted.precision !== "date") throw new ControlFailure("precision_mismatch", "my97_date");
    if (await this.my97Frame()) throw new ControlFailure("overlay_ownership_unknown", "my97_open");
    await this.act((await this.read()).input);
    const frame = await this.tx.wait(() => this.my97Frame(), Boolean, "my97_open");
    const fillHeader = async (selector2, next) => {
      this.tx.check();
      await this.read();
      const handle = await frame.$(selector2);
      if (!handle) throw new ControlFailure("unsupported_component", "my97_header");
      try {
        const locator = handle.asLocator().setTimeout(Math.max(1, Math.min(3e3, this.tx.deadline - Date.now())));
        await fencedLocatorAction(locator, this.tx.signal, (runner, options) => runner.fill(next, options), () => this.tx.start(), [handle]);
        await handle.press("Tab");
        this.tx.check();
      } finally {
        await handle.dispose();
      }
    };
    await fillHeader("div:has(> .YMenu) > .yminput", String(wanted.year));
    await fillHeader("div:has(> .MMenu) > .yminput", String(wanted.month));
    const weekday = await frame.$(".MTitle td:first-child");
    if (weekday) try {
      await preparePointerTarget(weekday);
      this.tx.check();
      await fencedLocatorAction(weekday.asLocator().setTimeout(3e3), this.tx.signal, (runner, options) => runner.click(options), () => this.tx.start(), [weekday]);
    } finally {
      await weekday.dispose();
    }
    const selector = `td[onclick="day_Click(${wanted.year},${wanted.month},${wanted.day});"]`;
    const available = async () => frame.$eval(selector, (el) => !/(?:disabled|invalid)/i.test(el.className) && el.getBoundingClientRect().width > 0).catch(() => false);
    await this.tx.wait(available, Boolean, "my97_day_ready");
    await this.read();
    this.tx.check();
    const day = await frame.$(selector);
    try {
      if (!day) throw new ControlFailure("target_unresolved", "my97_day");
      await preparePointerTarget(day);
      this.tx.check();
      const locator = day.asLocator().setTimeout(Math.max(1, Math.min(3e3, this.tx.deadline - Date.now())));
      await fencedLocatorAction(locator, this.tx.signal, (runner, options) => runner.click(options), () => this.tx.start(), [day]);
    } finally {
      await day?.dispose();
    }
    await this.tx.wait(() => this.read(), (s) => readCalendarText(s.value) === value && !s.invalid, "my97_verify");
    await this.tx.wait(() => this.my97Frame(), (f2) => !f2, "my97_close");
    await this.tx.pause(120);
    if (readCalendarText((await this.read()).value) !== value) throw new ControlFailure("postcondition_failed", "my97_verify");
    return this.result("verified_ui", true, { field_state: "filled", precision: "date" });
  }
  async setDate(value, overwrite = false, endpoint2) {
    const wanted = parseCalendarValue(value);
    if (!wanted) throw new ControlFailure("constraint_violation", "date_parse");
    let state = await this.read();
    if (endpoint2 === void 0) {
      const protectedResult = this.protect(state, value, overwrite, true);
      if (protectedResult) {
        if (protectedResult.status === "unchanged" && ["ant-date", "el-date", "ud-date", "sd-date", "phoenix-date"].includes(state.family)) {
          await this.openDate();
          await this.navigateCalendar(value, false);
          state = await this.read();
          await this.closeDate(state);
          if (readCalendarText((await this.read()).inputs[0]?.value || "") !== value)
            throw new ControlFailure("postcondition_failed", "existing_date_verify");
        }
        return protectedResult;
      }
    }
    if (state.family === "my97-date") return this.setMy97Date(value);
    if (!["native", "ant-date", "el-date", "ud-date", "sd-date", "phoenix-date"].includes(state.family))
      throw new ControlFailure("unsupported_component", "date_probe");
    const input = state.inputs[endpoint2 ?? 0];
    if (!input) throw new ControlFailure("target_unresolved", "date_probe");
    const isRange = state.inputs.length > 1;
    if (isRange && endpoint2 === void 0)
      throw new ControlFailure("range_requires_endpoints", "date_probe");
    if (state.family === "native") {
      const min = state.constraints.min && parseCalendarValue(state.constraints.min);
      const max = state.constraints.max && parseCalendarValue(state.constraints.max);
      if (min && min.precision === wanted.precision && value < min.iso || max && max.precision === wanted.precision && value > max.iso)
        throw new ControlFailure("constraint_violation", "date_preflight");
      if (state.constraints.step && !["1", "any"].includes(state.constraints.step))
        throw new ControlFailure("unsupported_constraint", "date_preflight");
      if (input.type === "datetime-local" || input.type === "time")
        throw new ControlFailure("unsupported_date_time", "date_preflight");
      if (input.readonly) throw new ControlFailure("unsupported_component", "date_probe");
      if (input.type === "month" && wanted.precision !== "month" || input.type === "date" && wanted.precision !== "date")
        throw new ControlFailure("date_precision_mismatch", "date_probe");
      this.tx.check("date_input");
      await this.act(input.token, "fill", value);
      await this.act(input.token, "blur");
    } else {
      state = await this.openDate(endpoint2 ?? 0);
      if (state.hasTime) throw new ControlFailure("unsupported_date_time", "date_probe");
      if (!state.precision) throw new ControlFailure("date_precision_unknown", "date_probe");
      if (wanted.precision !== state.precision)
        throw new ControlFailure("date_precision_mismatch", "date_probe");
      const hint = input.placeholder?.toUpperCase();
      const known = wanted.precision === "date" ? ["YYYY-MM-DD", "YYYY/MM/DD", "YYYY\u5E74MM\u6708DD\u65E5"] : ["YYYY-MM", "YYYY/MM", "YYYY\u5E74MM\u6708"];
      if (!isRange && !input.readonly && known.includes(hint)) {
        const rendered = hint.replace("YYYY", String(wanted.year).padStart(4, "0")).replace("MM", String(wanted.month).padStart(2, "0")).replace("DD", String(wanted.day || 1).padStart(2, "0"));
        this.tx.check("date_input");
        await this.act(input.token, "fill", rendered);
        await this.act(input.token, "press", "Enter");
        state = await this.tx.wait(
          () => this.read(),
          () => true,
          "date_commit"
        );
        if (state.confirm) await this.act(state.confirm);
      } else await this.navigateCalendar(value, true, endpoint2);
      if (!isRange) {
        state = await this.read();
        await this.act(state.inputs[0].token, "blur");
      }
    }
    if (isRange) return this.result("partial", false, { phase: "range_endpoint" });
    const matches2 = (s) => readCalendarText(s.inputs[0]?.value || s.value) === value && !s.invalid;
    await this.tx.wait(
      () => this.read(),
      (s) => matches2(s) && !s.expanded,
      "date_verify",
      2e3
    );
    await this.tx.pause(120);
    state = await this.read();
    if (!matches2(state)) throw new ControlFailure("postcondition_failed", "date_verify");
    if (state.family !== "native") {
      await this.openDate();
      await this.navigateCalendar(value, false);
      state = await this.read();
      await this.closeDate(state);
      if (!matches2(await this.read()))
        throw new ControlFailure("postcondition_failed", "date_reopen_verify");
    }
    return this.result("verified_ui", true, { field_state: "selected", selected: value });
  }
  async selectPath(path, overwrite = false) {
    let state = await this.read();
    if (state.family === "guopin-path") {
      if (path.length < 2 || path.length > 4) throw new ControlFailure("unsupported_path_depth", "guopin_path_preflight");
      const wanted = state.multiple ? path.at(-1) : path.join(" / ");
      const verifyExisting = state.multiple && sameValue(state.value, wanted) && state.tags.length === 1;
      if (!state.multiple && sameValue(state.value, wanted)) return this.result("unchanged", true, { completed_path: path });
      const protectedResult2 = verifyExisting ? null : this.protect(state, wanted, overwrite);
      if (protectedResult2) return protectedResult2;
      if (!await this.frame.evaluate(beginDictionary, state.root)) throw new ControlFailure("overlay_ownership_unknown", "guopin_path_open");
      await this.act(state.trigger);
      state = await this.ready((s) => Boolean(s.guopinPath?.parents.length), "guopin_path_open");
      let route = path;
      if (state.guopinPath.tabs.length) {
        const tabs = state.guopinPath.tabs.filter((t) => t.label === path[0] && !t.disabled);
        if (tabs.length !== 1) throw new ControlFailure("path_country_required", "guopin_path_country");
        await this.act(tabs[0].token, "click", void 0, path[0]);
        route = path.slice(1);
        this.tx.progress.push(path[0]);
        state = await this.ready((s) => Boolean(s.guopinPath?.parents.length), "guopin_path_country");
      }
      if (route.length < 2 || route.length > 3) throw new ControlFailure("unsupported_path_depth", "guopin_path_parent");
      const parents = state.guopinPath.parents.filter((p) => p.label === route[0] && !p.disabled);
      if (parents.length !== 1) throw new ControlFailure(parents.length ? "option_ambiguous" : "option_not_found", "guopin_path_parent");
      await this.act(parents[0].token, "click", void 0, route[0]);
      this.tx.progress.push(route[0]);
      for (let level = 1; level < route.length; level++) {
        state = await this.ready((s) => samePath(s.guopinPath?.path ?? [], route.slice(0, level)) && Boolean(s.guopinPath?.leaves.length), "guopin_path_children");
        const leaves = state.guopinPath.leaves.filter((p) => p.label === route[level] && !p.disabled);
        if (leaves.length !== 1) throw new ControlFailure(leaves.length ? "option_ambiguous" : "option_not_found", "guopin_path_leaf");
        if (verifyExisting && level === route.length - 1) {
          if (!leaves[0].selected) throw new ControlFailure("selected_path_conflict", "guopin_path_verify");
        } else await this.act(leaves[0].token, "click", void 0, route[level]);
        this.tx.progress.push(route[level]);
      }
      state = await this.read();
      if (state.multiple && state.expanded) {
        state = await this.ready((s) => Boolean(s.confirm), "guopin_path_confirm");
        await this.act(state.confirm);
      }
      await this.tx.wait(() => this.read(), (s) => !s.expanded && sameValue(s.value, wanted), "guopin_path_verify");
      return this.result("verified_ui", true, { completed_path: path, readback_value: wanted });
    }
    if (!["ant-path", "el-path", "sd-select"].includes(state.family))
      throw new ControlFailure("unsupported_component", "path_probe");
    const existing = state.value.split(/\s*\/\s*/);
    if (samePath(existing, path)) return this.result("unchanged", true, { completed_path: path });
    const protectedResult = this.protect(state, path.join(" / "), overwrite);
    if (protectedResult) return protectedResult;
    if (!state.expanded) {
      this.tx.check("path_open");
      await this.act(state.trigger);
    }
    state = await this.ready((s) => s.columns.length > 0, "path_open");
    for (let level = 0; level < path.length; level++) {
      this.tx.check(`path_level_${level}`);
      state = await this.ready((s) => Boolean(s.columns[level]?.length), "path_loading");
      this.checkPathPrefix(state, path.slice(0, level));
      const matches3 = state.columns[level].filter((c) => c.label === path[level]);
      if (matches3.length !== 1)
        throw new ControlFailure(
          matches3.length ? "option_ambiguous" : "option_not_found",
          this.tx.phase
        );
      const item = matches3[0];
      if (item.disabled) throw new ControlFailure("constraint_violation", this.tx.phase);
      const last = level === path.length - 1;
      if (!last) {
        const previousChildren = JSON.stringify(
          state.columns[level + 1]?.map((c) => [c.token, c.label]) || []
        );
        const switchedParent = !item.selected;
        if (!item.selected || !state.columns[level + 1]?.length) {
          await this.actOption(path[level], level, "hover", false, path.slice(0, level));
          await this.tx.pause(120);
          state = await this.read();
          if (!state.columns[level]?.some((c) => c.label === path[level] && c.selected)) {
            const current = state.columns[level]?.find((c) => c.label === path[level]);
            await this.actOption(path[level], level, "click", false, path.slice(0, level));
          }
        }
        state = await this.tx.wait(
          () => this.read(),
          (s) => Boolean(
            s.columns[level]?.some((c) => c.label === path[level] && !c.loading && (c.selected || s.family === "sd-select" && !s.columns[level].some((o) => o.selected)))
          ) && Boolean(s.columns[level + 1]?.length) && (!switchedParent || JSON.stringify(s.columns[level + 1]?.map((c) => [c.token, c.label]) || []) !== previousChildren),
          "path_loading"
        );
      } else {
        await this.actOption(path[level], level, "click", true, path.slice(0, level));
        await this.tx.pause(100);
        state = await this.read();
        if (state.confirm) await this.act(state.confirm);
      }
      this.tx.progress.push(path[level]);
    }
    const matches2 = (s) => !s.invalid && (s.family === "sd-select" ? !s.expanded && samePath(s.value.split(/\s*\/\s*/), path) : samePath(s.value.split(/\s*\/\s*/), path) || !s.expanded && s.value === path.at(-1) && this.tx.progress.length === path.length);
    await this.tx.wait(() => this.read(), matches2, "path_commit");
    await this.tx.pause(120);
    state = await this.read();
    if (!matches2(state)) throw new ControlFailure("postcondition_failed", "path_verify");
    return this.result("verified_ui", true, {
      field_state: "selected",
      requested_path: path,
      completed_path: [...this.tx.progress]
    });
  }
  async selectOption(value, overwrite = false, query, datePart, allowCustom = false) {
    let state = await this.read();
    if (state.family === "dayee-dictionary") {
      const protectedResult2 = this.protect(state, value, overwrite);
      if (protectedResult2) return protectedResult2;
      if (!await this.frame.evaluate(beginDictionary, state.root)) throw new ControlFailure("overlay_ownership_unknown", "dictionary_open");
      await this.act(state.trigger);
      state = await this.ready((s) => Boolean(s.dictionary?.search), "dictionary_open");
      await this.act(state.dictionary.search, "fill", query ?? value.split(/[（(]/)[0]);
      try {
        state = await this.ready((s) => s.options.some((o) => sameValue(o.label, value)), "dictionary_search");
      } catch (error2) {
        this.tx.check();
        if (!(error2 instanceof ControlFailure) || error2.code !== "postcondition_timeout") throw error2;
        const current = await this.read();
        if (current.dictionary?.cancel) await this.act(current.dictionary.cancel);
        throw new ControlFailure("option_not_found", "dictionary_search");
      }
      const choices = state.options.filter((o) => sameValue(o.label, value));
      if (choices.length !== 1) throw new ControlFailure("option_ambiguous", "dictionary_select");
      await this.act(choices[0].token, "click", void 0, choices[0].label);
      state = await this.tx.wait(() => this.read(), (s) => Boolean(s.confirm) || !s.expanded, "dictionary_commit_ready");
      if (state.expanded) await this.act(state.confirm);
      await this.tx.wait(() => this.read(), (s) => !s.expanded && sameValue(s.value, value) && !s.invalid, "dictionary_verify");
      await this.tx.pause(120);
      if (!sameValue((await this.read()).value, value)) throw new ControlFailure("postcondition_failed", "dictionary_verify");
      return this.result("verified_ui", true, { field_state: "selected", selected: value });
    }
    if (state.nativeOptions) {
      const choices = state.nativeOptions.filter((option) => !option.disabled && (datePart ? datePartNumber(option.label, datePart) === Number(value) : sameValue(option.label, value)));
      if (choices.length !== 1) throw new ControlFailure(choices.length ? "target_ambiguous" : "option_not_found", "native_select");
      const choice = choices[0];
      if (state.disabled) throw new ControlFailure("constraint_violation", "native_select");
      if (sameValue(state.value, choice.label)) return this.result("unchanged", true);
      if (state.value && !overwrite) return this.result("preserved", false, { reason: "existing_value" });
      await this.act(state.input, "fill", choice.value);
      await this.tx.wait(() => this.read(), (s) => sameValue(s.value, choice.label) && !s.invalid, "native_select_verify");
      return this.result("verified_ui", true);
    }
    if (!["ant-select", "el-select", "sd-select", "ud-select", "phoenix-select", "phoenix-radio", "ant-radio", "phoenix-autocomplete", "job51-autocomplete"].includes(state.family))
      throw new ControlFailure("unsupported_component", "select_probe");
    if (state.multiple) throw new ControlFailure("multiple_requires_values", "select_probe");
    const matchesValue = (actual) => datePart ? datePartNumber(value, datePart) !== null && datePartNumber(actual, datePart) === datePartNumber(value, datePart) : sameValue(actual, value);
    if (datePart && !state.disabled && matchesValue(state.value)) return this.result("unchanged", true);
    if (["phoenix-autocomplete", "job51-autocomplete"].includes(state.family) && state.editing) throw new ControlFailure("uncommitted_selection", "autocomplete_preflight");
    const protectedResult = this.protect(state, value, overwrite);
    if (protectedResult) return protectedResult;
    if (["phoenix-autocomplete", "job51-autocomplete"].includes(state.family)) {
      if (state.family === "job51-autocomplete" && allowCustom && state.companion?.value && state.companion.value !== value && !overwrite)
        return this.result("preserved", false, { reason: "existing_companion_value" });
      await this.act(state.input, "fill", query || value);
      if (state.family === "job51-autocomplete") await this.tx.pause(400);
      try {
        state = await this.ready((s) => s.options.some((o) => sameValue(o.label, value)) || Boolean(s.family === "job51-autocomplete" && allowCustom && s.companion?.input && s.options.some((o) => o.disabled && /没有找到/.test(o.label)) && s.options.some((o) => o.label === s.companion.otherLabel && !o.disabled)), "autocomplete_search");
      } catch (error2) {
        await this.act((await this.read()).input, "blur");
        if (error2 instanceof ControlFailure && error2.code === "postcondition_timeout") throw new ControlFailure("option_not_found", "autocomplete_search");
        throw error2;
      }
      if (state.family === "job51-autocomplete" && !state.options.some((o) => sameValue(o.label, value)) && allowCustom && state.companion?.input) {
        await this.actOption(state.companion.otherLabel);
        state = await this.read();
        if (!state.companion?.input) throw new ControlFailure("target_unresolved", "autocomplete_other");
        await this.act(state.companion.input, "fill", value);
        await this.act(state.companion.input, "blur");
      } else await this.actOption(value);
      state = await this.read();
      await this.act(state.input, "blur");
      await this.tx.wait(() => this.read(), (s) => !s.expanded && sameValue(s.value, value) && !s.invalid, "autocomplete_commit");
      await this.tx.pause(120);
      state = await this.read();
      if (state.editing || state.expanded || !sameValue(state.value, value) || state.invalid) throw new ControlFailure("postcondition_failed", "autocomplete_verify");
      return this.result("verified_ui", true, { field_state: "selected", selected: value });
    }
    if (state.family === "phoenix-radio" || state.family === "ant-radio") {
      const choices = state.options.filter((option) => sameValue(option.label, value));
      if (choices.length !== 1) throw new ControlFailure(choices.length ? "option_ambiguous" : "option_not_found", "radio_option");
      if (choices[0].disabled) throw new ControlFailure("constraint_violation", "radio_option");
      await this.act(choices[0].token, "click", void 0, choices[0].label);
      await this.tx.wait(() => this.read(), (s) => sameValue(s.value, value) && !s.invalid, "radio_commit");
      await this.tx.pause(120);
      const after = await this.read();
      if (!sameValue(after.value, value) || after.invalid) throw new ControlFailure("postcondition_failed", "radio_verify");
      return this.result("verified_ui", true, { field_state: "selected", selected: value });
    }
    if (!state.expanded) {
      this.tx.check("select_open");
      await this.act(state.trigger);
    }
    if (state.family === "phoenix-select") {
      state = await this.ready((s) => s.options.length > 0 || Boolean(s.pendingSelection), "select_options");
      if (state.pendingSelection) return this.selectPhoenixMany([value], "replace", overwrite);
    }
    if (query) {
      state = await this.read();
      if (state.readonly) throw new ControlFailure("query_not_supported", "select_search");
      await this.act(state.input, "fill", query);
    }
    state = await this.ready((s) => s.options.length > 0 || Boolean(s.custom?.entry || s.custom?.input), "select_options");
    if (query && !state.options.some((o) => matchesValue(o.label)) && !state.custom?.entry && !state.custom?.input) {
      try {
        state = await this.ready((s) => s.options.some((o) => matchesValue(o.label)) || Boolean(s.custom?.entry || s.custom?.input), "search_results");
      } catch (error2) {
        if (error2 instanceof ControlFailure && error2.code === "postcondition_timeout") throw new ControlFailure("option_not_found", "search_results");
        throw error2;
      }
    }
    if (!query && state.scroll && state.scroll.top > 1 && !state.options.some((o) => matchesValue(o.label))) {
      await this.act(state.scroll.token, "scroll", 0);
      state = await this.ready((s) => Boolean(s.scroll && s.scroll.top < 1), "select_scroll_reset");
    }
    const seen = /* @__PURE__ */ new Set();
    for (let step = 0; step < 60; step++) {
      const matches2 = state.options.filter((o) => matchesValue(o.label));
      if (matches2.length > 1) throw new ControlFailure("option_ambiguous", "select_option");
      if (matches2[0]) {
        if (matches2[0].disabled) throw new ControlFailure("constraint_violation", "select_option");
        await this.actOption(matches2[0].label);
        break;
      }
      const scroll = state.scroll;
      const signature = JSON.stringify([state.options.map((o) => o.label), scroll?.top]);
      if (!scroll || seen.has(signature) || scroll.top + scroll.height >= scroll.total - 2) {
        if (allowCustom && state.custom && (state.custom.entry || state.custom.input)) {
          if (state.custom.entry) await this.clickCustom("entry");
          state = await this.ready((s) => Boolean(s.custom?.input && s.custom.confirm), "custom_input");
          await this.act(state.custom.input, "fill", value);
          state = await this.read();
          if (!state.custom?.confirm) throw new ControlFailure("target_unresolved", "custom_confirm");
          await this.clickCustom("confirm");
          break;
        }
        throw new ControlFailure("option_not_found", "select_search");
      }
      seen.add(signature);
      this.tx.check("select_scroll");
      await this.act(
        scroll.token,
        "scroll",
        Math.min(scroll.top + scroll.height * 0.8, scroll.total - scroll.height)
      );
      state = await this.ready(
        (s) => JSON.stringify(s.options.map((o) => o.label)) !== JSON.stringify(state.options.map((o) => o.label)) || s.scroll?.top !== scroll.top,
        "select_scroll"
      );
      if (step === 59) throw new ControlFailure("virtual_list_budget_exceeded", "select_scroll");
    }
    state = await this.tx.wait(
      () => this.read(),
      (s) => matchesValue(s.value),
      "select_commit"
    );
    if (state.family === "ud-select" || state.family === "sd-select" || state.family === "phoenix-select") {
      await this.act(state.input, "blur");
      await this.tx.wait(() => this.read(), (s) => !s.expanded, "select_close");
    }
    await this.tx.pause(120);
    const finalState = await this.read();
    if (!matchesValue(finalState.value) || finalState.invalid || ["ud-select", "sd-select", "phoenix-select"].includes(state.family) && finalState.expanded)
      throw new ControlFailure("postcondition_failed", "select_verify");
    return this.result("verified_ui", true, { field_state: "selected", selected: value });
  }
  async setSplitDate(value, overwrite = false) {
    const range2 = typeof value === "string" ? { start: value } : value;
    const start = parseCalendarValue(range2.start);
    const end = range2.end ? parseCalendarValue(range2.end) : null;
    if (!start || start.precision !== "month" || range2.end && (!end || end.precision !== "month") || range2.current && range2.end || range2.end && range2.start > range2.end)
      throw new ControlFailure("date_precision_mismatch", "split_date_parse");
    let state = await this.read();
    const group = state.splitDate;
    if (!group || (typeof value === "string" ? group.parts.length !== 2 : group.parts.length !== 4) || typeof value !== "string" && !range2.current && !end)
      throw new ControlFailure("range_requires_endpoints", "split_date_parse");
    if (range2.current && !group.current) throw new ControlFailure("missing_current_field", "split_date_parse");
    const expected = (part) => (part.endpoint === "start" ? start : end)[part.part];
    const wantedParts = group.parts.filter((part) => part.endpoint === "start" || !range2.current);
    const currentMatches = (next) => {
      const g = next.splitDate;
      return Boolean(g && g.parts.length === group.parts.length && !next.invalid && g.parts.filter((part) => part.endpoint === "start" || !range2.current).every((part) => !part.invalid && datePartNumber(part.value, part.part) === expected(part)) && (range2.current ? g.current?.checked && g.parts.filter((part) => part.endpoint === "end").every((part) => part.disabled || !part.value) : !g.current?.checked));
    };
    if (currentMatches(state)) return this.result("unchanged", true);
    const waitingOnYear = (part) => {
      const year = group.parts.find((candidate) => candidate.endpoint === part.endpoint && candidate.part === "year");
      return part.part === "month" && Boolean(year && !year.disabled && datePartNumber(year.value, "year") !== expected(year));
    };
    if (state.disabled || wantedParts.some((part) => part.disabled && !(part.endpoint === "end" && group.current?.checked) && !waitingOnYear(part)) || group.current?.disabled && group.current.checked !== Boolean(range2.current))
      throw new ControlFailure("constraint_violation", "split_date_preflight");
    if (!overwrite && (group.current?.checked && !range2.current || group.parts.some((part) => part.value && (part.endpoint === "end" && range2.current || datePartNumber(part.value, part.part) !== expected(part)))))
      return this.result("preserved", false, { reason: "existing_value" });
    const setCurrent = async (checked) => {
      const before = (await this.read()).splitDate?.current;
      if (!before || before.checked === checked) return;
      if (before.disabled) throw new ControlFailure("constraint_violation", "split_date_current");
      this.tx.check("split_date_current");
      await this.act(before.token);
      await this.tx.wait(() => this.read(), (next) => next.splitDate?.current?.checked === checked, "split_date_current");
    };
    if (!range2.current) await setCurrent(false);
    for (let index = 0; index < group.parts.length; index++) {
      const initial = group.parts[index];
      if (initial.endpoint === "end" && range2.current) continue;
      this.tx.check(`split_date_${initial.endpoint}_${initial.part}`);
      state = await this.tx.wait(() => this.read(), (next) => Boolean(next.splitDate?.parts[index] && !next.splitDate.parts[index].disabled), "split_date_enabled");
      const part = state.splitDate.parts[index];
      if (part.endpoint !== initial.endpoint || part.part !== initial.part || state.splitDate.parts.length !== group.parts.length)
        throw new ControlFailure("range_scope_conflict", "split_date_preflight");
      const child = new _ControlDriver(this.page, { field: part.label, identity: part.identity, frame: this.page.frames().indexOf(this.frame) }, { pageId: 0, transaction: this.tx });
      await child.selectOption(String(expected(part)), true, void 0, part.part);
    }
    if (range2.current) await setCurrent(true);
    await this.tx.wait(() => this.read(), currentMatches, "split_date_verify");
    await this.tx.pause(120);
    if (!currentMatches(await this.read())) throw new ControlFailure("postcondition_failed", "split_date_verify");
    return this.result("verified_ui", true, { field_state: "selected", ...typeof value === "string" ? { selected: value } : { range: range2 } });
  }
  async setBoolean(value) {
    const state = await this.read();
    if (state.disabled || state.checked === null)
      throw new ControlFailure("constraint_violation", "boolean_preflight");
    if (state.checked === value) return this.result("unchanged", true);
    this.tx.check("boolean_set");
    await this.act(state.trigger);
    await this.tx.wait(
      () => this.read(),
      (s) => s.checked === value,
      "boolean_verify"
    );
    return this.result("verified_ui", true);
  }
  async setRange(start, end, overwrite = false) {
    const a = parseCalendarValue(start), b = parseCalendarValue(end);
    if (!a || !b || a.precision !== b.precision || start > end)
      throw new ControlFailure("constraint_violation", "range_parse");
    let state = await this.read();
    if (state.disabled) throw new ControlFailure("constraint_violation", "range_preflight");
    if (state.inputs.length !== 2)
      throw new ControlFailure("range_requires_end_field", "range_probe");
    const matches2 = (s) => readCalendarText(s.inputs[0]?.value || "") === start && readCalendarText(s.inputs[1]?.value || "") === end && !s.invalid;
    const unchanged = matches2(state);
    if (unchanged && state.family !== "ud-date") return this.result("unchanged", true);
    if (state.inputs.some((x) => x.value) && !overwrite && !unchanged)
      return this.result("preserved", false, { reason: "existing_value" });
    if (!unchanged) {
      await this.setDate(start, true, 0);
      await this.setDate(end, true, 1);
    }
    state = await this.read();
    if (state.confirm) await this.act(state.confirm);
    await this.act(state.inputs[1].token, "blur");
    await this.tx.wait(() => this.read(), matches2, "range_verify");
    await this.tx.pause(120);
    state = await this.read();
    if (!matches2(state)) throw new ControlFailure("postcondition_failed", "range_verify");
    await this.openDate();
    await this.navigateCalendar(start, false, 0);
    if (state.family === "ud-date") {
      await this.closeDate(await this.read());
      await this.openDate(1);
    }
    await this.navigateCalendar(end, false, 1);
    state = await this.read();
    await this.closeDate(state, state.family === "ud-date" ? 1 : 0);
    if (!matches2(await this.read()))
      throw new ControlFailure("postcondition_failed", "range_reopen_verify");
    return this.result(unchanged ? "unchanged" : "verified_ui", true, { field_state: "selected", range: { start, end } });
  }
  async selectMany(values, mode = "add", overwrite = false) {
    if (new Set(values).size !== values.length)
      throw new ControlFailure("constraint_violation", "multiple_parse");
    let state = await this.read();
    if (state.family === "guopin-certificates") {
      const paths = values.map((value) => value.split(" / "));
      if (paths.some((path) => path.length < 2 || path.length > 3 || path.some((part) => !part))) throw new ControlFailure("explicit_paths_required", "certificate_parse");
      const leaves = paths.map((path) => path.at(-1));
      if (new Set(leaves).size !== leaves.length) throw new ControlFailure("ambiguous_leaf_names", "certificate_parse");
      if (mode === "replace" && state.tags.some((tag) => !leaves.includes(tag))) return this.result("preserved", false, { reason: "existing_value" });
      const desired2 = mode === "add" ? [.../* @__PURE__ */ new Set([...state.tags, ...leaves])] : leaves;
      for (const path of paths) {
        state = await this.ready((s) => Boolean(s.guopinPath?.parents.length), "certificate_parent");
        const parents = state.guopinPath.parents.filter((p) => p.label === path[0] && !p.disabled);
        if (parents.length !== 1) throw new ControlFailure("option_not_found", "certificate_parent");
        await this.act(parents[0].token, "click", void 0, path[0]);
        for (let level = 1; level < path.length; level++) {
          state = await this.ready((s) => samePath(s.guopinPath?.path ?? [], path.slice(0, level)) && Boolean(s.guopinPath?.leaves.length), "certificate_children");
          const options = state.guopinPath.leaves.filter((p) => p.label === path[level] && !p.disabled);
          if (options.length !== 1) throw new ControlFailure("option_not_found", "certificate_leaf");
          if (level < path.length - 1 || !options[0].selected) await this.act(options[0].token, "click", void 0, path[level]);
        }
      }
      await this.tx.wait(() => this.read(), (s) => sameSet(s.tags, desired2), "certificate_pending_verify");
      return this.result("verified_ui", true, { completed_paths: values, readback_values: desired2, commit_state: "pending_confirmation" });
    }
    if (state.family === "phoenix-select" && state.multiple && !state.disabled) return this.selectPhoenixMany(values, mode, overwrite);
    if (!["ant-select", "el-select", "ud-select"].includes(state.family) || state.disabled)
      throw new ControlFailure("unsupported_component", "multiple_probe");
    if (state.opaqueSelection)
      throw new ControlFailure("unsupported_collapsed_selection", "multiple_probe");
    if (!state.multiple) {
      if (state.family === "ant-select")
        throw new ControlFailure("not_multiple_control", "multiple_probe");
      if (!state.expanded) await this.act(state.trigger);
      state = await this.ready((s) => s.options.length > 0, "multiple_probe");
      if (!state.multiple) throw new ControlFailure("not_multiple_control", "multiple_probe");
    }
    const desired = mode === "add" ? [.../* @__PURE__ */ new Set([...state.tags, ...values])] : values;
    if (sameSet(state.tags, desired)) return this.result("unchanged", true, { selected: state.tags });
    if (mode === "replace" && state.tags.some((v) => !desired.includes(v)) && !overwrite)
      return this.result("preserved", false, { reason: "existing_value" });
    if (!state.expanded) await this.act(state.trigger);
    state = await this.ready((s) => s.options.length > 0, "multiple_open");
    if (!state.multiple) throw new ControlFailure("not_multiple_control", "multiple_probe");
    const changes = [
      ...state.tags.filter((v) => !desired.includes(v)),
      ...desired.filter((v) => !state.tags.includes(v))
    ];
    for (const value of changes) {
      const previouslySelected = state.tags.includes(value);
      const seen = /* @__PURE__ */ new Set();
      for (let scrollCount = 0; scrollCount < 60; scrollCount++) {
        const options = state.options.filter((o) => o.label === value);
        if (options.length > 1) throw new ControlFailure("option_ambiguous", "multiple_option");
        if (options[0]) {
          if (options[0].disabled)
            throw new ControlFailure("constraint_violation", "multiple_option");
          await this.actOption(value, void 0, "click", state.family === "ud-select");
          break;
        }
        const scroll = state.scroll;
        const signature = JSON.stringify([state.options.map((o) => o.label), scroll?.top]);
        if (!scroll || seen.has(signature) || scroll.top + scroll.height >= scroll.total - 2)
          throw new ControlFailure("option_not_found", "multiple_option");
        seen.add(signature);
        await this.act(
          scroll.token,
          "scroll",
          Math.min(scroll.top + scroll.height * 0.8, scroll.total - scroll.height)
        );
        state = await this.ready((s) => s.scroll?.top !== scroll.top, "multiple_scroll");
        if (scrollCount === 59)
          throw new ControlFailure("virtual_list_budget_exceeded", "multiple_option");
      }
      state = await this.tx.wait(
        () => this.read(),
        (s) => s.tags.includes(value) !== previouslySelected,
        "multiple_commit"
      );
      if (!state.expanded && value !== changes.at(-1)) {
        await this.act(state.trigger);
        state = await this.read();
      }
    }
    await this.act(state.input, "press", "Escape");
    if (state.family === "ud-select") {
      await this.act(state.input, "blur");
      await this.tx.wait(() => this.read(), (current) => !current.expanded, "multiple_close");
    }
    await this.tx.pause(120);
    state = await this.read();
    if (state.invalid || !sameSet(state.tags, desired))
      throw new ControlFailure("postcondition_failed", "multiple_verify");
    return this.result("verified_ui", true, { field_state: "selected", selected: desired });
  }
  async selectPhoenixMany(values, mode, overwrite) {
    let state = await this.read();
    const committed = (s) => s.multiple ? s.tags : s.value ? [s.value] : [];
    const initial = committed(state);
    const desired = mode === "add" ? [.../* @__PURE__ */ new Set([...initial, ...values])] : values;
    if (sameSet(initial, desired)) return this.result("unchanged", true, { selected: initial });
    if (mode === "replace" && !overwrite && initial.some((v) => !desired.includes(v))) return this.result("preserved", false, { reason: "existing_value" });
    if (!state.expanded) await this.act(state.trigger);
    state = await this.ready((s) => Boolean(s.pendingSelection), "multiple_pending_open");
    if (!sameSet(state.pendingSelection.selected, initial)) throw new ControlFailure("uncommitted_selection", "multiple_preflight");
    const changes = [...initial.filter((v) => !desired.includes(v)), ...desired.filter((v) => !initial.includes(v))];
    for (const value of changes) {
      if (!state.pendingSelection?.search) throw new ControlFailure("unsupported_component", "multiple_search");
      await this.act(state.pendingSelection.search, "fill", value);
      state = await this.ready((s) => Boolean(s.pendingSelection?.options.some((o) => sameValue(o.label, value))), "multiple_search");
      const options = state.pendingSelection.options.filter((o) => sameValue(o.label, value));
      if (options.length !== 1) throw new ControlFailure(options.length ? "option_ambiguous" : "option_not_found", "multiple_search");
      const option = options[0];
      if (option.disabled || !option.check) throw new ControlFailure("constraint_violation", "multiple_option");
      const wasSelected = state.pendingSelection.selected.includes(value);
      await this.act(option.check, "click", void 0, option.label);
      state = await this.tx.wait(() => this.read(), (s) => Boolean(s.pendingSelection) && s.pendingSelection.selected.includes(value) !== wasSelected, "multiple_pending_commit");
    }
    if (!sameSet(state.pendingSelection.selected, desired) || !state.confirm) throw new ControlFailure("postcondition_failed", "multiple_pending_verify");
    await this.act(state.confirm);
    await this.tx.wait(() => this.read(), (s) => !s.expanded && sameSet(committed(s), desired), "multiple_confirm");
    await this.tx.pause(120);
    state = await this.read();
    if (state.invalid || state.expanded || !sameSet(committed(state), desired)) throw new ControlFailure("postcondition_failed", "multiple_verify");
    return this.result("verified_ui", true, { field_state: "selected", selected: state.multiple ? desired : desired[0] });
  }
  async openPopup() {
    const state = await this.read();
    if (state.disabled) throw new ControlFailure("constraint_violation", "popup_open");
    if (state.family === "guopin-path") {
      if (!state.expanded) {
        if (!await this.frame.evaluate(beginDictionary, state.root)) throw new ControlFailure("overlay_ownership_unknown", "guopin_path_open");
        await this.act(state.trigger);
      }
      await this.ready((s) => Boolean(s.guopinPath?.parents.length), "guopin_path_open");
      return;
    }
    if (state.family === "dayee-dictionary") {
      if (!state.expanded) {
        if (!await this.frame.evaluate(beginDictionary, state.root)) throw new ControlFailure("overlay_ownership_unknown", "dictionary_open");
        await this.act(state.trigger);
      }
      await this.ready((s) => Boolean(s.dictionary?.search), "dictionary_open");
      return;
    }
    if (state.family.endsWith("-date")) {
      await this.openDate();
      return;
    }
    if (!["ant-select", "el-select", "sd-select", "ud-select", "phoenix-select", "ant-path", "el-path"].includes(state.family))
      throw new ControlFailure("unsupported_component", "popup_open");
    if (!state.expanded) await this.act(state.trigger);
    await this.ready((s) => s.options.length > 0 || s.columns.length > 0 || Boolean(s.custom) || Boolean(s.pendingSelection) || s.expanded, "popup_open");
  }
  async dismissPopup() {
    const before = await this.read();
    if (!before.expanded) return;
    if (!before.popupToken) throw new ControlFailure("overlay_ownership_unknown", "popup_close");
    if (before.family.endsWith("-date")) await this.closeDate(before, before.activeEndpoint ?? 0);
    else if (before.family === "guopin-path") {
      if (!before.guopinPath?.close) throw new ControlFailure("target_unresolved", "guopin_path_close");
      await this.act(before.guopinPath.close);
      await this.tx.wait(() => this.read(), (s) => !s.expanded, "guopin_path_close");
    } else if (before.family === "dayee-dictionary") {
      if (!before.dictionary?.cancel) throw new ControlFailure("target_unresolved", "dictionary_close");
      await this.act(before.dictionary.cancel);
      await this.tx.wait(() => this.read(), (s) => !s.expanded, "dictionary_close");
    } else {
      await this.act(before.input, "press", "Escape");
      await this.tx.pause(60);
      let state = await this.read();
      if (state.expanded && state.dismiss) await this.act(state.dismiss);
      else if (state.expanded) await this.act(state.input, "blur");
      state = await this.tx.wait(() => this.read(), (s) => !s.expanded, "popup_close", 1200);
    }
    const after = await this.read();
    if (!sameValue(after.value, before.value) || !sameSet(after.tags, before.tags))
      throw new ControlFailure("value_changed_during_close", "popup_close");
  }
  async dismissOwnedPopup() {
    if (!this.popupToken || this.tx.signal.aborted || this.tx.deadline - Date.now() < 1500) return false;
    try {
      this.tx.check("failure_popup_cleanup");
      await this.dismissPopup();
      return true;
    } catch {
      return false;
    }
  }
  close() {
    this.tx.close();
  }
};

// src/browser/execution-mode.ts
function fixtureDiagnosticsAllowed(url, env = process.env) {
  if (env.RESUME_COMPANION_TEST_DIAGNOSTICS !== "1" || env.RESUME_COMPANION_CHROME_HEADLESS !== "1" || env.RESUME_COMPANION_SUPERVISOR_EPHEMERAL !== "1") return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) || u.protocol === "data:" || url === "about:blank";
  } catch {
    return false;
  }
}

// src/browser/planning/recipes.ts
var f = (key2, ...labels) => ({ key: key2, labels });
var basic = [f("full_name", "\u59D3\u540D"), f("phone", "\u624B\u673A\u53F7", "\u624B\u673A\u53F7\u7801"), f("email", "\u90AE\u7BB1"), f("gender", "\u6027\u522B"), f("birth_date", "\u51FA\u751F\u65E5\u671F"), f("city", "\u6240\u5728\u5730", "\u73B0\u5C45\u4F4F\u5730"), f("employment_status", "\u5DE5\u4F5C\u7ECF\u9A8C", "\u5DE5\u4F5C\u5E74\u9650"), f("highest_education", "\u6700\u9AD8\u5B66\u5386"), f("recent_company", "\u6700\u8FD1\u516C\u53F8")];
var education = [f("school", "\u5B66\u6821\u540D\u79F0"), f("major", "\u4E13\u4E1A\u540D\u79F0", "\u4E13\u4E1A"), f("college", "\u5B66\u9662"), { ...f("level", "\u5B66\u5386"), transform: "degree" }, { ...f("study_mode", "\u5B66\u5386\u7C7B\u578B", "\u5B66\u4E60\u5F62\u5F0F"), transform: "study_mode" }, f("degree", "\u5B66\u4F4D"), f("range", "\u8D77\u6B62\u65F6\u95F4", "\u5C31\u8BFB\u65F6\u95F4"), f("current", "\u81F3\u4ECA"), f("start", "\u5F00\u59CB\u65F6\u95F4"), f("end", "\u7ED3\u675F\u65F6\u95F4")];
var experience = [f("organization", "\u516C\u53F8\u540D\u79F0"), f("role", "\u804C\u4F4D\u540D\u79F0"), f("description", "\u63CF\u8FF0", "\u5DE5\u4F5C\u804C\u8D23"), f("range", "\u8D77\u6B62\u65F6\u95F4"), f("current", "\u81F3\u4ECA"), f("start", "\u5F00\u59CB\u65F6\u95F4"), f("end", "\u7ED3\u675F\u65F6\u95F4")];
var project = [f("name", "\u9879\u76EE\u540D\u79F0"), f("role", "\u9879\u76EE\u89D2\u8272", "\u804C\u8D23", "\u804C\u52A1"), f("description", "\u9879\u76EE\u63CF\u8FF0"), f("responsibilities", "\u9879\u76EE\u4E2D\u804C\u8D23"), f("range", "\u8D77\u6B62\u65F6\u95F4"), f("current", "\u81F3\u4ECA"), f("start", "\u5F00\u59CB\u65F6\u95F4"), f("end", "\u7ED3\u675F\u65F6\u95F4"), f("url", "\u9879\u76EE\u94FE\u63A5")];
var tail = [
  { sections: ["\u8BED\u8A00\u80FD\u529B"], sources: ["languages"], repeated: true, fields: [f("name", "\u8BED\u8A00\u7C7B\u578B", "\u8BED\u8A00"), f("overall", "\u638C\u63E1\u7A0B\u5EA6", "\u7CBE\u901A\u7A0B\u5EA6"), f("speaking", "\u542C\u8BF4"), f("writing", "\u8BFB\u5199")] },
  { sections: ["\u83B7\u5956\u7ECF\u5386"], sources: ["awards"], repeated: true, fields: [f("name", "\u5956\u9879\u540D\u79F0"), f("obtained_month", "\u83B7\u5956\u65F6\u95F4"), f("description", "\u63CF\u8FF0")] },
  { sections: ["\u8BC1\u4E66"], sources: ["certificates"], repeated: true, fields: [f("name", "\u8BC1\u4E66\u540D\u79F0"), f("description", "\u63CF\u8FF0"), f("obtained_month", "\u83B7\u5F97\u65F6\u95F4"), f("issuer", "\u9881\u53D1\u673A\u6784")] },
  { sections: ["\u7ADE\u8D5B"], sources: ["competitions"], repeated: true, fields: [f("name", "\u7ADE\u8D5B\u540D\u79F0"), f("description", "\u63CF\u8FF0")] },
  { sections: ["\u6821\u56ED\u7ECF\u5386"], sources: ["campus"], repeated: true, fields: [f("organization", "\u7EC4\u7EC7\u540D\u79F0"), f("role", "\u804C\u4F4D\u540D\u79F0"), f("description", "\u63CF\u8FF0"), f("range", "\u8D77\u6B62\u65F6\u95F4")] },
  { sections: ["\u81EA\u6211\u63CF\u8FF0", "\u81EA\u6211\u8BC4\u4EF7"], sources: ["basic"], reveal: true, fields: [f("self_description", "\u81EA\u6211\u63CF\u8FF0", "\u81EA\u6211\u8BC4\u4EF7")] },
  { sections: ["\u4F5C\u54C1\u94FE\u63A5"], sources: ["basic"], fields: [f("portfolio_url", "\u4F5C\u54C1\u94FE\u63A5")] }
];
var basics = [{ sections: ["\u57FA\u672C\u4FE1\u606F", "\u57FA\u7840\u4FE1\u606F", "\u4E2A\u4EBA\u4FE1\u606F"], sources: ["basic"], fields: basic }];
var intent = { sections: ["\u6C42\u804C\u610F\u5411"], sources: ["intent"], fields: [f("cities", "\u671F\u671B\u5DE5\u4F5C\u57CE\u5E02"), { ...f("cities", "\u671F\u671B\u57CE\u5E02"), transform: "cities_text" }, f("current_salary", "\u5F53\u524D\u85AA\u8D44"), f("expected_salary", "\u671F\u671B\u85AA\u8D44"), f("industry", "\u671F\u671B\u4ECE\u4E8B\u884C\u4E1A"), f("occupation", "\u671F\u671B\u4ECE\u4E8B\u804C\u4E1A")] };
var detailedBasic = [
  ...basic,
  f("phone", "\u79FB\u52A8\u7535\u8BDD", "\u624B\u673A", "\u624B\u673A\u53F7\u7801 / \u53F7\u7801", "\u624B\u673A\u53F7 / \u53F7\u7801", "\u624B\u673A / \u53F7\u7801"),
  f("phone_country", "\u624B\u673A\u53F7\u7801 / \u533A\u53F7", "\u624B\u673A\u53F7 / \u533A\u53F7", "\u624B\u673A / \u533A\u53F7"),
  f("english_test_type", "\u82F1\u8BED\u6C34\u5E73 / \u7C7B\u578B"),
  f("english_test_result", "\u82F1\u8BED\u6C34\u5E73 / \u7B49\u7EA7"),
  f("other_language", "\u5176\u4ED6\u5916\u8BED / \u7C7B\u578B"),
  f("other_language_level", "\u5176\u4ED6\u5916\u8BED / \u7B49\u7EA7"),
  f("email", "\u7535\u5B50\u90AE\u7BB1", "\u7535\u5B50\u90AE\u4EF6"),
  f("highest_education", "\u5B66\u5386"),
  f("identity_type", "\u8BC1\u4EF6\u7C7B\u578B", "\u8EAB\u4EFD\u8BC1\u53F7 / \u7C7B\u578B", "\u8EAB\u4EFD\u8BC1\u53F7\u7801 / \u7C7B\u578B", "\u8BC1\u4EF6\u53F7\u7801 / \u7C7B\u578B"),
  f("identity_number", "\u8BC1\u4EF6\u53F7\u7801", "\u8EAB\u4EFD\u8BC1\u53F7\u7801", "\u8EAB\u4EFD\u8BC1\u53F7", "\u8BC1\u4EF6\u53F7\u7801 / \u53F7\u7801", "\u8EAB\u4EFD\u8BC1\u53F7\u7801 / \u53F7\u7801", "\u8EAB\u4EFD\u8BC1\u53F7 / \u53F7\u7801"),
  f("ethnicity", "\u6C11\u65CF"),
  f("political_status", "\u653F\u6CBB\u9762\u8C8C"),
  f("marital_status", "\u5A5A\u59FB\u72B6\u51B5"),
  f("health_status", "\u5065\u5EB7\u72B6\u51B5"),
  f("medical_history", "\u75C5\u53F2\u4FE1\u606F"),
  f("height_cm", "\u8EAB\u9AD8", "\u8EAB\u9AD8\uFF08cm\uFF09"),
  f("weight_kg", "\u4F53\u91CD", "\u4F53\u91CD\uFF08kg\uFF09"),
  f("residence_province", "\u73B0\u5C45\u4F4F\u5730 / \u7701\u4EFD", "\u73B0\u5C45\u4F4F\u57CE\u5E02 / \u7701\u4EFD", "\u76EE\u524D\u5C45\u4F4F\u5730 / \u7701\u4EFD", "\u76EE\u524D\u6240\u5728\u57CE\u5E02 / \u7701\u4EFD"),
  f("residence_city", "\u73B0\u5C45\u4F4F\u5730 / \u57CE\u5E02", "\u73B0\u5C45\u4F4F\u57CE\u5E02 / \u57CE\u5E02", "\u76EE\u524D\u5C45\u4F4F\u5730 / \u57CE\u5E02", "\u76EE\u524D\u6240\u5728\u57CE\u5E02 / \u57CE\u5E02"),
  f("native_province", "\u7C4D\u8D2F / \u7701\u4EFD"),
  f("native_city", "\u7C4D\u8D2F / \u57CE\u5E02"),
  f("origin_province", "\u9AD8\u8003\u751F\u6E90\u5730 / \u7701\u4EFD"),
  f("origin_city", "\u9AD8\u8003\u751F\u6E90\u5730 / \u57CE\u5E02"),
  f("target_province", "\u671F\u671B\u5DE5\u4F5C\u5730\u70B9 / \u7701\u4EFD"),
  f("target_city", "\u671F\u671B\u5DE5\u4F5C\u5730\u70B9 / \u57CE\u5E02"),
  f("address", "\u6709\u6548\u901A\u8BAF\u5730\u5740", "\u901A\u4FE1\u5730\u5740"),
  f("training_mode", "\u57F9\u517B\u65B9\u5F0F"),
  f("highest_school", "\u6700\u9AD8\u5B66\u5386\u6BD5\u4E1A\u9662\u6821"),
  f("highest_major", "\u6700\u9AD8\u5B66\u5386\u4E13\u4E1A"),
  f("graduation_date", "\u6BD5\u4E1A\u65F6\u95F4(\u4E0E\u6BD5\u4E1A\u8BC1\u4E00\u81F4)"),
  f("major_rank", "\u6700\u9AD8\u5B66\u5386\u4E13\u4E1A\u6392\u540D"),
  f("scholarship_status", "\u5956\u5B66\u91D1\u60C5\u51B5"),
  f("failed_courses", "\u6302\u79D1\u60C5\u51B5"),
  f("interview_location", "\u671F\u671B\u9762\u8BD5\u5730\u70B9"),
  f("recruitment_channel", "\u62DB\u8058\u4FE1\u606F\u83B7\u53D6\u6E20\u9053"),
  f("veteran_status", "\u662F\u5426\u9000\u5F79\u519B\u4EBA"),
  f("applicant_type", "\u7533\u8BF7\u8005\u7C7B\u522B")
];
var detailedEducation = [
  ...education,
  f("school", "\u5B66\u6821"),
  f("major", "\u4E13\u4E1A\uFF08\u9AD8\u4E2D\u548C\u521D\u4E2D\u5B66\u5386\u4E13\u4E1A\u9009\u62E9\u201C\u5176\u4ED6\u201D\uFF09"),
  f("description", "\u4E13\u4E1A\u63CF\u8FF0"),
  f("city_province", "\u57CE\u5E02 / \u7701\u4EFD"),
  f("city", "\u57CE\u5E02 / \u57CE\u5E02"),
  f("major_rank", "\u4E13\u4E1A\u6392\u540D"),
  f("full_time", "\u662F\u5426\u5168\u65E5\u5236")
];
var recipes = [
  { id: "guopin/module-editor/v1", family: "guopin", sections: [
    { sections: ["\u6C42\u804C\u610F\u5411"], sources: ["intent"], fields: [f("position_path", "\u671F\u671B\u804C\u4F4D"), f("location_path", "\u5DE5\u4F5C\u5730\u533A"), f("industry_path", "\u671F\u671B\u884C\u4E1A"), f("salary_min", "\u85AA\u8D44\u8981\u6C42\uFF08\u5143/\u6708\uFF09 / \u6700\u4F4E"), f("salary_max", "\u85AA\u8D44\u8981\u6C42\uFF08\u5143/\u6708\uFF09 / \u6700\u9AD8")] },
    { sections: ["\u81EA\u6211\u8BC4\u4EF7"], sources: ["basic"], fields: [f("self_description", "\u81EA\u6211\u8BC4\u4EF7")] },
    { sections: ["\u8D44\u683C\u8BC1\u4E66"], sources: ["basic"], fields: [f("guopin_certificate_paths", "\u8BC1\u4E66\u540D\u79F0")] },
    { sections: ["\u9879\u76EE\u7ECF\u5386"], sources: ["projects"], repeated: true, fields: [f("name", "\u9879\u76EE\u540D\u79F0"), f("role", "\u9879\u76EE\u89D2\u8272"), f("range", "\u8D77\u6B62\u65F6\u95F4"), f("start", "\u8D77\u6B62\u65F6\u95F4 / \u5F00\u59CB"), f("end", "\u8D77\u6B62\u65F6\u95F4 / \u7ED3\u675F"), f("organization", "\u6240\u5728\u5355\u4F4D"), f("team_size", "\u56E2\u961F\u89C4\u6A21"), f("description", "\u9879\u76EE\u4ECB\u7ECD"), f("responsibilities", "\u9879\u76EE\u804C\u8D23"), f("results", "\u9879\u76EE\u6210\u679C")] },
    { sections: ["\u5DE5\u4F5C/\u5B9E\u4E60\u7ECF\u5386"], sources: ["internships", "work"], repeated: true, fields: [f("organization", "\u5355\u4F4D\u540D\u79F0"), f("company_type", "\u5355\u4F4D\u6027\u8D28"), f("role", "\u804C\u4F4D\u540D\u79F0"), f("employment_type", "\u5DE5\u4F5C\u6027\u8D28"), f("range", "\u5728\u804C\u65F6\u95F4"), f("start", "\u5728\u804C\u65F6\u95F4 / \u5F00\u59CB"), f("end", "\u5728\u804C\u65F6\u95F4 / \u7ED3\u675F"), f("description", "\u5DE5\u4F5C\u5185\u5BB9"), f("company_headcount", "\u5355\u4F4D\u89C4\u6A21"), f("department", "\u90E8\u95E8"), f("reports_to", "\u6C47\u62A5\u5BF9\u8C61"), f("subordinates", "\u4E0B\u5C5E\u4EBA\u6570"), f("monthly_salary_yuan", "\u7A0E\u524D\u6708\u85AA"), f("industry_path", "\u6240\u5C5E\u884C\u4E1A"), f("location_path", "\u5DE5\u4F5C\u5730\u533A"), f("overseas", "\u6D77\u5916\u5DE5\u4F5C")] },
    { sections: ["\u6559\u80B2\u7ECF\u5386"], sources: ["education"], repeated: true, fields: [...education.filter((r) => r.key !== "study_mode"), f("enrollment_mode", "\u7EDF\u62DB"), f("study_mode", "\u5168\u65E5\u5236"), f("has_degree", "\u5B66\u4F4D\u8BC1"), f("degree_path", "\u5B66\u4F4D\u7EC6\u5206"), f("range", "\u5C31\u8BFB\u5E74\u6708"), f("guopin_major_category", "\u4E13\u4E1A\u5206\u7C7B"), f("major_rank", "\u4E13\u4E1A\u6392\u540D"), f("has_overseas", "\u6D77\u5916\u7559\u5B66"), f("description", "\u5728\u6821\u7ECF\u5386"), f("school_system", "\u5B66\u5236"), f("edu_cert_no", "\u5B66\u5386\u8BC1\u4E66\u7F16\u53F7"), f("degree_cert_no", "\u5B66\u4F4D\u8BC1\u4E66\u7F16\u53F7")] }
  ] },
  { id: "dayee/ant-resume/v1", family: "dayee", sections: [
    { sections: ["\u4E2A\u4EBA\u57FA\u672C\u4FE1\u606F"], sources: ["basic"], fields: detailedBasic },
    { sections: ["\u6559\u80B2\u7ECF\u5386"], sources: ["education"], repeated: true, fields: [...detailedEducation.filter((rule) => rule.key !== "study_mode"), f("enrollment_mode", "\u5B66\u4E60\u5F62\u5F0F")] },
    { sections: ["\u5B9E\u4E60\u7ECF\u5386", "\u5DE5\u4F5C\u7ECF\u5386"], sources: ["internships", "work"], repeated: true, fields: [...experience, f("organization", "\u4F01\u4E1A\u540D\u79F0"), f("company_type", "\u4F01\u4E1A\u6027\u8D28"), f("company_size", "\u4F01\u4E1A\u89C4\u6A21"), f("description", "\u5DE5\u4F5C\u63CF\u8FF0")] },
    { sections: ["\u9879\u76EE\u7ECF\u9A8C"], sources: ["projects"], repeated: true, fields: [...project, f("responsibilities", "\u9879\u76EE\u804C\u8D23"), f("organization", "\u6240\u5C5E\u516C\u53F8")] },
    { sections: ["\u6821\u5185\u804C\u52A1"], sources: ["campus"], repeated: true, fields: [f("organization", "\u5B66\u6821\u540D\u79F0", "\u7EC4\u7EC7\u540D\u79F0", "\u7EC4\u7EC7/\u56E2\u4F53\u540D\u79F0"), f("role", "\u804C\u52A1\u540D\u79F0", "\u804C\u52A1", "\u62C5\u4EFB\u804C\u52A1"), f("cadre_level", "\u5E72\u90E8\u7EA7\u522B"), f("description", "\u804C\u52A1\u63CF\u8FF0", "\u5DE5\u4F5C\u63CF\u8FF0", "\u804C\u8D23\u548C\u6210\u5C31"), f("start", "\u5F00\u59CB\u65F6\u95F4"), f("end", "\u7ED3\u675F\u65F6\u95F4")] },
    { sections: ["\u6280\u80FD\u8D44\u8D28"], sources: ["certificates"], repeated: true, fields: [f("name", "\u8BC1\u4E66\u540D\u79F0", "\u6280\u80FD\u540D\u79F0", "\u4E13\u4E1A\u6280\u80FD\u8BC1\u4E66\u540D\u79F0"), f("issuer", "\u9881\u53D1\u673A\u6784"), f("obtained_month", "\u83B7\u5F97\u65F6\u95F4"), f("description", "\u8BC1\u4E66\u63CF\u8FF0", "\u63CF\u8FF0")] },
    { sections: ["\u5916\u8BED\u80FD\u529B"], sources: ["languages"], record_filter: "english", fields: [f("overall", "\u82F1\u8BED\u7B49\u7EA7"), f("score", "CET \u6210\u7EE9"), f("exam_id", "\u51C6\u8003\u8BC1\u53F7"), f("exam_month", "\u8003\u8BD5\u65F6\u95F4"), f("toefl_score", "TOFEL\u5206\u6570"), f("ielts_score", "IELTS\u5206\u6570"), f("testdaf_score", "Test Daf\u5206\u6570"), f("dsh_score", "DSH\u5206\u6570"), f("other_scores", "\u5176\u4ED6\u5916\u8BED\u53CA\u6210\u7EE9"), f("report_number", "\u6210\u7EE9\u5355\u7F16\u53F7")] },
    { sections: ["\u5176\u4ED6\u5916\u8BED\u80FD\u529B"], sources: ["languages"], record_filter: "other_languages", repeated: true, fields: [f("name", "\u5916\u8BED\u8BED\u79CD", "\u8BED\u79CD", "\u5176\u4ED6\u5916\u8BED\u79CD\u7C7B"), f("overall", "\u638C\u63E1\u7A0B\u5EA6", "\u5916\u8BED\u7B49\u7EA7", "\u5176\u4ED6\u5916\u8BED\u6C34\u5E73"), f("score", "\u6210\u7EE9")] },
    { sections: ["\u5BB6\u5EAD\u5173\u7CFB"], sources: ["family"], repeated: true, fields: [f("name", "\u59D3\u540D"), f("relation", "\u5173\u7CFB"), f("phone", "\u8054\u7CFB\u7535\u8BDD"), f("birth_date", "\u51FA\u751F\u65E5\u671F"), f("organization", "\u5DE5\u4F5C\u5355\u4F4D"), f("role", "\u804C\u4F4D"), f("address", "\u73B0\u4F4F\u5740"), f("status", "\u73B0\u72B6")] },
    { sections: ["\u79D1\u7814\u7ECF\u5386"], sources: ["research"], repeated: true, fields: [f("start", "\u5F00\u59CB\u65F6\u95F4"), f("end", "\u7ED3\u675F\u65F6\u95F4"), f("name", "\u7814\u7A76\u8BFE\u9898/\u9879\u76EE"), f("participation", "\u53C2\u4E0E\u5EA6"), f("supervisor", "\u5BFC\u5E08"), f("description", "\u6210\u679C")] },
    { sections: ["\u81EA\u6211\u8BC4\u4EF7"], sources: ["basic"], fields: [f("self_description", "\u8BC4\u4EF7\u5185\u5BB9")] }
  ] },
  { id: "51job/legacy-resume/v1", family: "job51", sections: [
    { sections: ["\u4E2A\u4EBA\u4FE1\u606F", "\u57FA\u672C\u4FE1\u606F"], sources: ["basic"], fields: [
      ...detailedBasic,
      ...[
        f("employment_status", "\u7533\u8BF7\u8005\u7C7B\u522B"),
        f("origin_province", "\u751F\u6E90\u7C4D\u8D2F\u6240\u5728\u57CE\u5E02 / \u7701\u4EFD"),
        f("origin_city", "\u751F\u6E90\u7C4D\u8D2F\u6240\u5728\u57CE\u5E02 / \u57CE\u5E02"),
        f("origin_is_jiangsu", "\u751F\u6E90\u7C4D\u8D2F\u662F\u5426\u4E3A\u6C5F\u82CF\u7701 / \u7C7B\u578B"),
        f("residence_is_jiangsu", "\u76EE\u524D\u6240\u5728\u57CE\u5E02\u662F\u5426\u4E3A\u6C5F\u82CF\u7701 / \u7C7B\u578B"),
        f("criminal_record", "\u662F\u5426\u6709\u8FDD\u6CD5\u72AF\u7F6A\u8BB0\u5F55"),
        f("qualification_category", "\u4E13\u4E1A\u6280\u672F\u8D44\u683C\u53CA\u804C\u4E1A\u8D44\u683C\u8BC1\u4E66 / \u7C7B\u578B"),
        f("other_certificates", "\u5176\u4ED6\u8D44\u683C\u8BC1\u4E66"),
        f("written_test_city", "\u610F\u5411\u7EBF\u4E0B\u7B14\u8BD5\u57CE\u5E02"),
        f("recruitment_channel_job51", "\u4ECE\u54EA\u91CC\u77E5\u9053\u62DB\u8058\u4FE1\u606F"),
        f("available_date", "\u4F55\u65F6\u53EF\u4EE5\u4E0A\u73ED"),
        f("expected_monthly_salary_band", "\u671F\u671B\u6708\u85AA\uFF08\u5143\uFF09"),
        f("self_description", "\u4E2A\u4EBA\u8BC4\u4EF7"),
        ...[["origin", "\u751F\u6E90\u7C4D\u8D2F"], ["residence", "\u76EE\u524D\u6240\u5728\u57CE\u5E02"]].flatMap(([prefix, label2]) => [
          { ...f(`${prefix}_jiangsu_city`, `${label2}\u662F\u5426\u4E3A\u6C5F\u82CF\u7701 / \u7C7B\u522B`), emptyBranch: { key: `${prefix}_is_jiangsu`, value: "\u5426" } },
          { ...f(`${prefix}_jiangsu_district`, `${label2}\u662F\u5426\u4E3A\u6C5F\u82CF\u7701 / \u660E\u7EC6`), emptyBranch: { key: `${prefix}_is_jiangsu`, value: "\u5426" } }
        ]),
        { ...f("qualification_type", "\u4E13\u4E1A\u6280\u672F\u8D44\u683C\u53CA\u804C\u4E1A\u8D44\u683C\u8BC1\u4E66 / \u7C7B\u522B"), emptyBranch: { key: "qualification_category", value: "\u65E0" } },
        { ...f("qualification_name", "\u4E13\u4E1A\u6280\u672F\u8D44\u683C\u53CA\u804C\u4E1A\u8D44\u683C\u8BC1\u4E66 / \u660E\u7EC6"), emptyBranch: { key: "qualification_category", value: "\u65E0" } }
      ].map((rule) => ({ ...rule, company: "26b69a02-efa5-4674-a984-40bcae578b0a" }))
    ] },
    { sections: ["\u6559\u80B2\u7ECF\u5386", "\u6559\u80B2\u80CC\u666F"], sources: ["education"], repeated: true, fields: [...detailedEducation.map((rule) => ["school", "major"].includes(rule.key) ? { ...rule, custom: true } : rule), f("level", "\u6700\u9AD8\u5B66\u5386", "\u5176\u4ED6\u5B66\u5386"), { ...f("school", "\u6BD5\u4E1A\u5B66\u6821"), custom: true }, { ...f("major", "\u6240\u5B66\u4E13\u4E1A"), custom: true }, f("school_other", "\u5176\u4ED6\u5B66\u6821"), f("major_other", "\u5176\u4ED6\u4E13\u4E1A"), f("start", "\u5165\u5B66\u65F6\u95F4"), f("end", "\u6BD5\u4E1A\u65F6\u95F4"), f("major_rank", "\u5B66\u4E60\u6210\u7EE9\u6392\u540D"), f("campus_role", "\u62C5\u4EFB\u804C\u52A1"), f("courses", "\u4E3B\u4FEE\u8BFE\u7A0B", "\u4E13\u4E1A\u8BFE\u7A0B"), f("enrolled_unified", "\u662F\u5426\u7EDF\u62DB"), f("upgraded_bachelor", "\u662F\u5426\u4E13\u5347\u672C"), f("overseas", "\u662F\u5426\u6709\u6D77\u5916\u7559\u5B66\u7ECF\u5386"), f("research_direction", "\u7814\u7A76\u65B9\u5411"), f("college", "\u6240\u5728\u9662\u7CFB"), f("full_time", "\u662F\u5426\u662F\u5168\u65E5\u5236"), f("class_rank", "\u73ED\u7EA7\u6392\u540D"), f("job51_school_region", "\u6BD5\u4E1A\u5B66\u6821 / \u7C7B\u578B"), f("job51_school_option", "\u6BD5\u4E1A\u5B66\u6821 / \u7B49\u7EA7"), f("job51_major_category", "\u4E13\u4E1A / \u7C7B\u578B"), f("job51_major_option", "\u4E13\u4E1A / \u7B49\u7EA7")] },
    { sections: ["\u5B9E\u4E60/\u5DE5\u4F5C\u7ECF\u5386", "\u5B9E\u4E60/\u5DE5\u4F5C\u7ECF\u9A8C"], sources: ["internships", "work"], repeated: true, fields: [...experience, f("organization", "\u4F01\u4E1A\u540D\u79F0"), f("role", "\u804C\u4F4D", "\u804C\u52A1", "\u804C\u4F4D / \u804C\u4F4D"), f("role_category", "\u804C\u4F4D / \u804C\u7C7B"), f("description", "\u5DE5\u4F5C\u63CF\u8FF0"), f("start", "\u5F00\u59CB\u65E5\u671F"), f("end", "\u7ED3\u675F\u65E5\u671F")] },
    { sections: ["\u7814\u7A76\u9879\u76EE\u7ECF\u5386", "\u9879\u76EE\u7ECF\u5386"], sources: ["projects"], repeated: true, fields: [...project, f("responsibilities", "\u9879\u76EE\u804C\u8D23"), f("start", "\u5F00\u59CB\u65E5\u671F"), f("end", "\u7ED3\u675F\u65E5\u671F"), f("role", "\u62C5\u4EFB\u804C\u4F4D/\u89D2\u8272"), f("organization", "\u9879\u76EE\u5355\u4F4D")] },
    { sections: ["\u793E\u56E2\uFF08\u5B66\u751F\u5DE5\u4F5C\u3001\u6D3B\u52A8\uFF09\u7ECF\u5386"], sources: ["campus"], repeated: true, fields: [f("organization", "\u793E\u56E2\u540D\u79F0", "\u7EC4\u7EC7\u540D\u79F0", "\u793E\u56E2\uFF08\u7EC4\u7EC7\uFF09\u540D\u79F0"), f("role", "\u804C\u52A1"), f("description", "\u5DE5\u4F5C\u63CF\u8FF0", "\u7ECF\u5386\u63CF\u8FF0", "\u793E\u56E2\u5DE5\u4F5C\u7ECF\u5386\u63CF\u8FF0"), f("student_cadre", "\u662F\u5426\u4E3A\u5B66\u751F\u5E72\u90E8"), f("range", "\u8D77\u6B62\u65F6\u95F4"), f("start", "\u5F00\u59CB\u65F6\u95F4", "\u5F00\u59CB\u65E5\u671F"), f("end", "\u7ED3\u675F\u65F6\u95F4", "\u7ED3\u675F\u65E5\u671F")] },
    { sections: ["\u81EA\u6211\u8BC4\u4EF7"], sources: ["basic"], fields: [f("self_description", "\u81EA\u6211\u8BC4\u4EF7"), f("cofco_understanding", "\u6211\u5BF9\u4E2D\u7CAE\u7684\u8BA4\u8BC6\u548C\u770B\u6CD5"), f("self_career_description", "\u81EA\u6211\u8BC4\u4EF7\u53CA\u804C\u4E1A\u751F\u6DAF\u89C4\u5212")] },
    { sections: ["\u5BB6\u5EAD\u6210\u5458\u4FE1\u606F"], sources: ["basic"], fields: [f("father_name", "\u7236\u4EB2\u59D3\u540D"), f("father_organization_role", "\u7236\u4EB2\u5DE5\u4F5C\u5355\u4F4D\u53CA\u804C\u4F4D"), f("mother_name", "\u6BCD\u4EB2\u59D3\u540D"), f("mother_organization_role", "\u6BCD\u4EB2\u5DE5\u4F5C\u5355\u4F4D\u53CA\u804C\u4F4D")] },
    { sections: ["\u8BED\u8A00\u80FD\u529B/\u6280\u80FD\u8BC1\u4E66"], sources: ["basic"], fields: [f("english_test_type", "\u82F1\u8BED\u6C34\u5E73"), f("english_score", "\u82F1\u8BED\u6210\u7EE9"), f("other_language", "\u5176\u4ED6\u5916\u8BED\u6C34\u5E73 / \u7C7B\u578B"), f("cofco_other_language_level", "\u5176\u4ED6\u5916\u8BED\u6C34\u5E73 / \u7B49\u7EA7"), f("primary_it_category", "IT\u6280\u80FD / \u7C7B\u578B"), f("primary_it_name", "IT\u6280\u80FD / \u7B49\u7EA7"), f("skills_text", "\u5176\u4ED6\u6280\u80FD"), f("certificate_names", "\u83B7\u5F97\u8BC1\u4E66\u540D\u79F0")] },
    { sections: ["\u83B7\u5956\u60C5\u51B5"], sources: ["awards"], repeated: true, fields: [f("name", "\u5956\u9879\u540D\u79F0"), f("obtained_month", "\u83B7\u5956\u65F6\u95F4"), f("level", "\u7EA7\u522B / \u7C7B\u578B"), f("grade", "\u7EA7\u522B / \u7B49\u7EA7"), f("description", "\u5956\u9879\u63CF\u8FF0")] },
    { sections: ["\u7ADE\u8D5B\u7ECF\u5386"], sources: ["competitions"], repeated: true, fields: [f("name", "\u7ADE\u8D5B\u540D\u79F0"), f("award_level", "\u83B7\u5956\u7B49\u7EA7"), f("obtained_month", "\u65F6\u95F4"), f("issuer", "\u4E3B\u529E\u5355\u4F4D"), f("description", "\u7ADE\u8D5B\u63CF\u8FF0")] },
    { sections: ["IT\u6280\u80FD"], sources: ["it_skills"], repeated: true, fields: [f("category", "\u6280\u80FD / \u7C7B\u522B"), f("name", "\u6280\u80FD / \u540D\u79F0"), f("overall", "\u638C\u63E1\u7A0B\u5EA6")] },
    ...tail
  ] },
  { id: "moka/sd-resume/v1", family: "sd", sections: [
    ...basics.map((s) => ({ ...s, fields: [...s.fields, { ...f("birth_date", "\u51FA\u751F\u65E5\u671F (\u5E74\u9F84)"), transform: "birth_month" }] })),
    intent,
    { sections: ["\u6559\u80B2\u80CC\u666F"], sources: ["education"], repeated: true, fields: education.map((x) => x.key === "school" || x.key === "major" ? { ...x, custom: true } : x) },
    { sections: ["\u5DE5\u4F5C\u7ECF\u5386"], sources: ["work"], repeated: true, fields: experience, negative: ["\u6CA1\u6709\u5DE5\u4F5C\u7ECF\u5386"] },
    { sections: ["\u5B9E\u4E60\u7ECF\u5386"], sources: ["internships"], repeated: true, fields: experience, negative: ["\u6CA1\u6709\u5B9E\u4E60\u7ECF\u5386"] },
    { sections: ["\u9879\u76EE\u7ECF\u9A8C"], sources: ["projects"], repeated: true, fields: project },
    ...tail
  ] },
  { id: "beisen/phoenix-resume/v1", family: "phoenix", sections: [
    ...basics,
    intent,
    { sections: ["\u6559\u80B2\u7ECF\u5386"], sources: ["education"], repeated: true, fields: education },
    { sections: ["\u5DE5\u4F5C\u7ECF\u5386"], sources: ["work", "internships"], repeated: true, fields: experience },
    { sections: ["\u5B9E\u4E60\u7ECF\u5386"], sources: ["internships"], repeated: true, fields: experience },
    { sections: ["\u9879\u76EE\u7ECF\u5386"], sources: ["projects"], repeated: true, fields: project.map((x) => x.key === "description" ? { ...x, key: "combined_description" } : x) },
    ...tail
  ] },
  { id: "feishu/ud-resume/v1", family: "ud", sections: [
    ...basics.map((s) => ({ ...s, fields: [...s.fields, f("cities", "\u671F\u671B\u5DE5\u4F5C\u5730\u70B9")] })),
    intent,
    { sections: ["\u6559\u80B2\u7ECF\u5386"], sources: ["education"], repeated: true, fields: education },
    { sections: ["\u5DE5\u4F5C\u7ECF\u5386"], sources: ["work"], repeated: true, fields: experience, negative: ["\u6CA1\u6709\u5DE5\u4F5C\u7ECF\u5386"] },
    { sections: ["\u5B9E\u4E60\u7ECF\u5386"], sources: ["internships"], repeated: true, fields: experience, negative: ["\u6CA1\u6709\u5B9E\u4E60\u7ECF\u5386"] },
    { sections: ["\u9879\u76EE\u7ECF\u5386"], sources: ["projects"], repeated: true, fields: [...project, f("combined_description", "\u63CF\u8FF0")] },
    ...tail
  ] }
];

// src/browser/planning/field-rules.ts
var normalizeField = (s) => s.replace(/[\s*＊:：]/g, "").toLowerCase();
var sectionOf = (scope) => scope.replace(/ \/ 第\d+条$/, "");
function recipeFor(fields2) {
  const families = [...new Set(fields2.map((f2) => f2.plannerFamily).filter(Boolean))];
  return families.length === 1 ? recipes.find((r) => r.family === families[0]) : void 0;
}
function fieldRules(section, label2, company) {
  return section.fields.filter((rule) => (!rule.company || rule.company === company) && rule.labels.some((l) => normalizeField(l) === normalizeField(label2)));
}

// src/browser/planning/capabilities.ts
var CAPABILITY_VERSION = "2026-09-21.4";
var evidence = "docs/51job\u4E0E\u5927\u6613\u9002\u914D\u5F00\u53D1\u8BB0\u5F55-2026-09-21.md";
var automatic = "docs/reports/2026-09-21-automatic-preparation-024-development.md";
var cofcoModules = ["\u4E2A\u4EBA\u4FE1\u606F", "\u6559\u80B2\u7ECF\u5386", "\u793E\u56E2\uFF08\u5B66\u751F\u5DE5\u4F5C\u3001\u6D3B\u52A8\uFF09\u7ECF\u5386", "\u5B9E\u4E60/\u5DE5\u4F5C\u7ECF\u5386", "\u7814\u7A76\u9879\u76EE\u7ECF\u5386", "\u7ADE\u8D5B\u7ECF\u5386", "\u83B7\u5956\u60C5\u51B5", "\u8BED\u8A00\u80FD\u529B/\u6280\u80FD\u8BC1\u4E66", "\u5BB6\u5EAD\u6210\u5458\u4FE1\u606F", "\u81EA\u6211\u8BC4\u4EF7"];
var templates = [
  {
    id: "feishu/bytedance-campus",
    name: "\u98DE\u4E66\uFF0F\u5B57\u8282\u6821\u56ED\u62DB\u8058",
    family: "ud",
    host: "jobs.bytedance.com",
    path: "/campus/resume/edit",
    status: "ordinary_fill_verified",
    modules: ["\u57FA\u672C\u4FE1\u606F", "\u6559\u80B2\u7ECF\u5386", "\u5B9E\u4E60\u7ECF\u5386", "\u5DE5\u4F5C\u7ECF\u5386", "\u9879\u76EE\u7ECF\u5386", "\u4F5C\u54C1", "\u7ADE\u8D5B", "\u8BC1\u4E66", "\u8BED\u8A00\u80FD\u529B", "\u81EA\u6211\u8BC4\u4EF7", "\u793E\u4EA4\u8D26\u53F7"],
    evidence: automatic,
    verified_version: "0.24.0+codex.20260921020533",
    verified_on: "2026-09-21",
    persistence: "not_verified",
    limitations: ["\u5DF2\u9A8C\u8BC1\u666E\u901A\u5B57\u6BB5\uFF1B\u4ECD\u6709\u8D44\u6599\u7F3A\u9879\u548C\u672A\u6620\u5C04\u7684\u4F01\u4E1A\u5B57\u6BB5\u3002", "\u672A\u9A8C\u8BC1\u4FDD\u5B58\u4E0E\u5237\u65B0\u6301\u4E45\u5316\u3002"],
    observed_unmapped: [{ section: "\u57FA\u672C\u4FE1\u606F", labels: ["\u624B\u673A\u53F7\u7801 / \u533A\u53F7", "\u4E2A\u4EBA\u8BC1\u4EF6 / \u7C7B\u578B"], modes: ["choice"] }, { section: "\u57FA\u672C\u4FE1\u606F", labels: ["\u4E2A\u4EBA\u8BC1\u4EF6"], modes: ["text"] }, { section: "\u6559\u80B2\u7ECF\u5386", labels: ["\u5B9E\u9A8C\u5BA4", "\u9886\u57DF\u65B9\u5411", "\u5BFC\u5E08"], modes: ["text"] }]
  },
  {
    id: "moka/kingdee-campus",
    name: "Moka\uFF0F\u91D1\u8776\u6821\u56ED\u62DB\u8058",
    family: "sd",
    host: "app.mokahr.com",
    path: "/campus-recruitment/kingdeehr/166565",
    status: "ordinary_fill_verified",
    modules: ["\u57FA\u7840\u4FE1\u606F", "\u4E2A\u4EBA\u4FE1\u606F", "\u6C42\u804C\u610F\u5411", "\u5DE5\u4F5C\u7ECF\u5386", "\u6559\u80B2\u80CC\u666F", "\u5B9E\u4E60\u7ECF\u5386", "\u9879\u76EE\u7ECF\u9A8C", "\u8BED\u8A00\u80FD\u529B", "\u81EA\u6211\u63CF\u8FF0", "\u83B7\u5956\u7ECF\u5386"],
    evidence: automatic,
    verified_version: "0.24.0+codex.20260921020533",
    verified_on: "2026-09-21",
    persistence: "not_verified",
    limitations: ["\u8BED\u8A00\u7A0B\u5EA6\u53EF\u80FD\u6CA1\u6709\u7B49\u4EF7\u9009\u9879\uFF0C\u4E0D\u80FD\u7528\u8FD1\u4F3C\u9009\u9879\u66FF\u4EE3\u3002", "\u672A\u9A8C\u8BC1\u4FDD\u5B58\u4E0E\u5237\u65B0\u6301\u4E45\u5316\u3002"],
    observed_unmapped: [{ section: "\u4E2A\u4EBA\u4FE1\u606F", labels: ["\u8BC1\u4EF6\u53F7\u7801 / \u7C7B\u578B"], modes: ["choice"] }, { section: "\u4E2A\u4EBA\u4FE1\u606F", labels: ["\u8BC1\u4EF6\u53F7\u7801"], modes: ["text"] }]
  },
  {
    id: "beisen/chery",
    name: "\u5317\u68EE\uFF0F\u5947\u745E",
    family: "phoenix",
    host: "chery.zhiye.com",
    path: "/form",
    status: "ordinary_fill_verified",
    modules: ["\u4E2A\u4EBA\u4FE1\u606F", "\u6C42\u804C\u610F\u5411", "\u6559\u80B2\u7ECF\u5386", "\u5DE5\u4F5C\u7ECF\u5386", "\u9879\u76EE\u7ECF\u5386"],
    evidence: automatic,
    verified_version: "0.24.0+codex.20260921020533",
    verified_on: "2026-09-21",
    persistence: "not_verified",
    limitations: ["\u5B66\u6821\u8BCD\u5E93\u65E0\u5019\u9009\u65F6\u4FDD\u7559\u672A\u5B8C\u6210\u9879\u3002", "\u672A\u9A8C\u8BC1\u4FDD\u5B58\u4E0E\u5237\u65B0\u6301\u4E45\u5316\u3002"],
    observed_unmapped: [{ section: "\u4E2A\u4EBA\u4FE1\u606F", labels: ["\u8BC1\u4EF6\u53F7\u7801"], modes: ["text"] }, { section: "\u6C42\u804C\u610F\u5411", labels: ["\u73B0\u6708\u85AA(\u7A0E\u524D)", "\u671F\u671B\u6708\u85AA(\u7A0E\u524D)", "\u5230\u5C97\u65F6\u95F4"], modes: ["choice"] }]
  },
  {
    id: "51job/cofco",
    name: "51job\uFF0F\u4E2D\u7CAE",
    family: "job51",
    host: "xyz.51job.com",
    path: "/External/MyResume/FillInResume.aspx",
    company: "9f8de839-e7de-40c9-8f16-10526e9ac1be",
    status: "ordinary_fill_verified",
    modules: cofcoModules,
    steps: [...cofcoModules.map((s) => [s]), ["\u672C\u4EBA\u627F\u8BFA"]],
    evidence,
    verified_version: "0.24.0+codex.20260921061719",
    verified_on: "2026-09-21",
    persistence: "preview_compared",
    limitations: ["\u5DF2\u9A8C\u8BC1\u5341\u4E2A\u666E\u901A\u9875\uFF1B\u672A\u6D4B\u6761\u4EF6\u5206\u652F\u4ECD\u9700\u5B9E\u65F6\u68C0\u67E5\u3002", "\u7167\u7247\u3001\u4EB2\u5C5E\u4EFB\u804C\u53CA\u672C\u4EBA\u627F\u8BFA\u7531\u7528\u6237\u5904\u7406\u3002", "\u9884\u89C8\u6BD4\u5BF9\u4E0D\u4EE3\u8868\u6700\u7EC8\u7533\u8BF7\u63D0\u4EA4\u3002"]
  },
  {
    id: "51job/j10058",
    name: "51job\uFF0FJ10058",
    family: "job51",
    host: "xyz.51job.com",
    path: "/External/MyResume/FillInResume.aspx",
    company: "470877a9-5b7a-4eb3-ad0e-4f6c732e27ec",
    status: "ordinary_fill_verified",
    modules: ["\u57FA\u672C\u4FE1\u606F", "\u6559\u80B2\u7ECF\u5386", "\u6559\u80B2\u80CC\u666F", "IT\u6280\u80FD", "\u5B9E\u4E60/\u5DE5\u4F5C\u7ECF\u9A8C", "\u81EA\u6211\u8BC4\u4EF7"],
    steps: [["\u4E0A\u4F20\u9644\u4EF6\u7B80\u5386", "\u4E0A\u4F20\u4E2A\u4EBA\u9644\u4EF6\u7B80\u5386"], ["\u57FA\u672C\u4FE1\u606F"], ["\u6559\u80B2\u7ECF\u5386", "\u6559\u80B2\u80CC\u666F"], ["IT\u6280\u80FD"], ["\u5B9E\u4E60/\u5DE5\u4F5C\u7ECF\u9A8C"], ["\u81EA\u6211\u8BC4\u4EF7"]],
    evidence,
    verified_version: "0.24.0+codex.20260921045442",
    verified_on: "2026-09-21",
    persistence: "sample_reopened",
    limitations: ["\u53EA\u5BF9\u5DF2\u9A8C\u6536\u6837\u672C\u7684\u666E\u901A\u5B57\u6BB5\u6709\u4FDD\u5B58\u540E\u91CD\u5F00\u8BC1\u636E\u3002", "\u53EF\u9009\u9644\u4EF6\u8DF3\u8FC7\uFF0C\u6700\u7EC8\u63D0\u4EA4\u4E0D\u81EA\u52A8\u6267\u884C\u3002"]
  },
  {
    id: "dayee/faw",
    name: "\u5927\u6613\uFF0F\u4E2D\u56FD\u4E00\u6C7D",
    family: "dayee",
    host: "faw-zhaopin.hotjob.cn",
    path: "/SU603374380dcad4635b836531/pb/resumeOperation.html",
    status: "ordinary_fill_verified",
    modules: ["\u4E2A\u4EBA\u57FA\u672C\u4FE1\u606F", "\u6559\u80B2\u7ECF\u5386", "\u5B9E\u4E60\u7ECF\u5386", "\u5DE5\u4F5C\u7ECF\u5386", "\u9879\u76EE\u7ECF\u9A8C", "\u6821\u5185\u804C\u52A1", "\u6280\u80FD\u8D44\u8D28", "\u5916\u8BED\u80FD\u529B", "\u5176\u4ED6\u5916\u8BED\u80FD\u529B", "\u5BB6\u5EAD\u5173\u7CFB", "\u79D1\u7814\u7ECF\u5386", "\u81EA\u6211\u8BC4\u4EF7"],
    evidence: "docs/reports/2026-09-21-dayee-guopin-development.md",
    verified_version: "0.24.0+codex.20260921125511",
    verified_on: "2026-09-21",
    persistence: "sample_reopened",
    limitations: ["\u672C\u7855\u3001\u57FA\u7840\u4FE1\u606F\u548C\u666E\u901A\u7ECF\u5386\u5171 114 \u9879\u5B8C\u6210 UI \u8BFB\u56DE\uFF1B\u5FC5\u586B\u8BC1\u4EF6\u7167\u53CA\u58F0\u660E\u4ECD\u7531\u672C\u4EBA\u5904\u7406\u3002", "\u6574\u4EFD\u4FDD\u5B58\u548C\u5237\u65B0\u5185\u5BB9\u9A8C\u6536\u672A\u5B8C\u6210\uFF1B\u4E0D\u80FD\u636E\u6B64\u58F0\u79F0\u6295\u9012\u6216\u6574\u7AD9\u9A8C\u6536\u901A\u8FC7\u3002"],
    observed_unmapped: [{ section: "\u4E2A\u4EBA\u57FA\u672C\u4FE1\u606F", labels: ["\u671F\u671B\u9762\u8BD5\u5730\u70B9"], modes: ["choice"] }]
  },
  {
    id: "51job/jiangsu-bank",
    name: "51job\uFF0F\u6C5F\u82CF\u519C\u5546\u94F6\u884C",
    family: "job51",
    host: "xyz.51job.com",
    path: "/External/MyResume/FillInResume.aspx",
    company: "26b69a02-efa5-4674-a984-40bcae578b0a",
    status: "in_development",
    modules: ["\u4E2A\u4EBA\u4FE1\u606F", "\u6559\u80B2\u80CC\u666F"],
    evidence: "docs/\u4EA7\u54C1\u6D41\u7A0B\u4E0E\u67B6\u6784\u6536\u655B\u8BA1\u5212-2026-09-21.md",
    verified_version: "0.24.0+codex.20260921061719",
    verified_on: "2026-09-21",
    persistence: "not_verified",
    limitations: ["\u4EC5\u4E2A\u4EBA\u9875\u7ECF\u8FC7\u539F\u7AD9\u586B\u5199\uFF1B\u6559\u80B2\u4E0E\u540E\u7EED\u9875\u9762\u5C1A\u672A\u5B8C\u6210\u9A8C\u6536\u3002"]
  },
  {
    id: "guopin/resume",
    name: "\u56FD\u8058\uFF0F\u7B80\u5386\u7F16\u8F91\u5668",
    family: "guopin",
    host: "c.iguopin.com",
    path: "/resume",
    status: "ordinary_fill_verified",
    modules: ["\u6C42\u804C\u610F\u5411", "\u6559\u80B2\u7ECF\u5386", "\u9879\u76EE\u7ECF\u5386", "\u5DE5\u4F5C/\u5B9E\u4E60\u7ECF\u5386", "\u81EA\u6211\u8BC4\u4EF7", "\u8D44\u683C\u8BC1\u4E66"],
    evidence: "docs/reports/2026-09-21-dayee-guopin-development.md",
    verified_version: "0.24.0+codex.20260921125511",
    verified_on: "2026-09-21",
    persistence: "sample_reopened",
    limitations: ["\u516D\u7C7B\u6A21\u5757\u5DF2\u6709\u586B\u5199\u3001\u4FDD\u5B58\u53CA\u5237\u65B0\u8BC1\u636E\uFF1B\u672C\u7855\u3001\u4E09\u6761\u5DE5\u4F5C\u3001\u610F\u5411\u3001\u81EA\u8BC4\u53CA\u56DB\u9879\u8BC1\u4E66\u5B8C\u6210 72 \u9879\u72EC\u7ACB\u9884\u89C8\u6BD4\u5BF9\u3002", "\u8D26\u53F7\u57FA\u672C\u4FE1\u606F\u4FDD\u6301\u5DF2\u6709\u503C\uFF0C\u672A\u9A8C\u8BC1\u7A7A\u767D\u8D26\u53F7\u57FA\u7840\u4FE1\u606F\u586B\u5199\uFF1B\u81EA\u5B9A\u4E49\u589E\u52A0\u7684\u5176\u4ED6\u6A21\u5757\u3001\u9644\u4EF6\u53CA\u5F53\u524D\u5728\u804C\u5206\u652F\u4E0D\u5728\u672C\u6B21\u5DF2\u9A8C\u6536\u8303\u56F4\u3002", "\u6A21\u5757\u4FDD\u5B58\u4E0D\u7B49\u4E8E\u6700\u7EC8\u7533\u8BF7\u63D0\u4EA4\u3002"]
  }
];
var platforms = [
  { id: "feishu-recruitment", name: "\u98DE\u4E66\u62DB\u8058", family: "ud", hosts: [{ kind: "exact", value: "jobs.bytedance.com" }], compatible: true, limitations: ["\u5F53\u524D\u53EF\u4FE1\u6765\u6E90\u4EC5\u5305\u542B\u5DF2\u5B9E\u6D4B\u7684\u62DB\u8058\u7AD9\uFF1B\u65B0\u589E\u5B98\u65B9\u627F\u8F7D\u57DF\u540D\u9700\u52A0\u5165\u76EE\u5F55\u3002"] },
  { id: "moka", name: "Moka", family: "sd", hosts: [{ kind: "exact", value: "app.mokahr.com" }], compatible: true, limitations: ["\u517C\u5BB9\u9875\u9762\u53EA\u586B\u5199\u5B9E\u65F6\u626B\u63CF\u540E\u53EF\u8BC6\u522B\u7684\u666E\u901A\u5B57\u6BB5\u3002"] },
  { id: "beisen", name: "\u5317\u68EE", family: "phoenix", hosts: [{ kind: "suffix", value: "zhiye.com" }], compatible: true, limitations: ["\u4E0D\u540C\u4F01\u4E1A\u8BCD\u5E93\u4ECD\u4EE5\u9875\u9762\u5019\u9009\u548C\u6267\u884C\u6838\u9A8C\u4E3A\u51C6\u3002"] },
  { id: "dayee", name: "\u5927\u6613", family: "dayee", hosts: [{ kind: "suffix", value: "hotjob.cn" }], compatible: true, limitations: ["\u4F01\u4E1A\u4E13\u7528\u5B57\u6BB5\u548C\u9009\u9879\u8F6C\u6362\u4E0D\u4ECE\u4E00\u6C7D\u6A21\u677F\u7EE7\u627F\u3002"] },
  { id: "guopin", name: "\u56FD\u8058", family: "guopin", hosts: [{ kind: "exact", value: "c.iguopin.com" }], compatible: true, limitations: ["\u53EA\u5904\u7406\u5DF2\u8BC6\u522B\u7684\u7B80\u5386\u6A21\u5757\uFF0C\u4E0D\u81EA\u52A8\u589E\u52A0\u7F51\u7AD9\u672A\u5F00\u653E\u7684\u6A21\u5757\u3002"] },
  { id: "51job-custom", name: "51job \u4F01\u4E1A\u5B9A\u5236", family: "job51", hosts: [{ kind: "exact", value: "xyz.51job.com" }], compatible: false, limitations: ["\u5206\u9875\u548C\u4F01\u4E1A\u5DEE\u5F02\u8F83\u5927\uFF0C\u7EE7\u7EED\u6309\u7CBE\u786E\u4F01\u4E1A\u6A21\u677F\u9A8C\u6536\u3002"] }
];
function publicTemplate(t) {
  return { id: t.id, name: t.name, family: t.family, status: t.status, modules: t.modules, evidence: t.evidence, verified_version: t.verified_version, verified_on: t.verified_on, persistence: t.persistence, limitations: t.limitations };
}
function platformModules(p) {
  return [...new Set(templates.filter((t) => t.family === p.family && t.status === "ordinary_fill_verified").flatMap((t) => t.modules))];
}
function publicPlatform(p) {
  return { id: p.id, name: p.name, family: p.family, compatible: p.compatible, modules: platformModules(p), evidence_templates: templates.filter((t) => t.family === p.family && t.status === "ordinary_fill_verified").map((t) => t.id), limitations: p.limitations };
}
function capabilityCatalog() {
  return { catalog_version: CAPABILITY_VERSION, platforms: platforms.map(publicPlatform), templates: templates.map(publicTemplate) };
}
var isButton = (f2) => f2.tag === "button" || f2.role === "button";
var hostMatches = (host2, rule) => rule.kind === "exact" ? host2 === rule.value : host2 === rule.value || host2.endsWith(`.${rule.value}`);
var platformForUrl = (url) => url.protocol === "https:" ? platforms.find((p) => p.hosts.some((rule) => hostMatches(url.hostname, rule))) : void 0;
var blockingDifference = (d) => d.code === "form_family_changed" || d.code === "workflow_changed" || d.code === "origin_not_trusted" || d.code === "unrecognized_required_control" || d.code === "unknown_required_module" || d.code === "unknown_required_field" || Boolean(d.required && ["control_kind_changed", "unsupported_control_kind"].includes(d.code));
function kindSupported(f2, keys, component) {
  if (!["text", "choice", "choice_or_custom", "date", "boolean"].includes(f2.inputMode ?? "")) return false;
  if (component) return true;
  if (keys.some((k) => ["full_name", "phone", "email", "description", "combined_description", "responsibilities", "self_description", "portfolio_url", "url"].includes(k))) return f2.inputMode === "text";
  if (keys.some((k) => ["range", "start", "end", "obtained_month", "birth_date"].includes(k))) return f2.inputMode === "date";
  return !["checkbox", "radio"].includes(f2.type) || f2.inputMode === "boolean" || f2.inputMode === "choice";
}
function inspectSupport(raw, env = process.env) {
  const differences = [], known_unmapped_fields = [], fillable = /* @__PURE__ */ new Set();
  const observedModuleSet = new Set(raw.fields.filter((f2) => f2.plannerFamily && !isButton(f2)).map((f2) => sectionOf(f2.scope)));
  let template, platform, match_level;
  const result = (status) => {
    const blocking = differences.filter(blockingDifference).length;
    const observed_modules = [...observedModuleSet];
    const fillable_modules = observed_modules.filter((module) => fillable.has(module));
    return {
      catalog_version: CAPABILITY_VERSION,
      observed_modules,
      known_unmapped_fields,
      fillable_modules,
      skipped_modules: observed_modules.filter((module) => !fillable.has(module)),
      manual_task_count: manualTasks(raw).length,
      status,
      autofill_allowed: status === "supported_partial" && blocking === 0 || status === "fixture",
      ...match_level ? { match_level } : {},
      ...template ? { template: publicTemplate(template) } : {},
      ...platform ? { platform: publicPlatform(platform) } : {},
      differences: differences.slice(0, 20),
      difference_count: differences.length,
      blocking_difference_count: blocking,
      advisory_difference_count: differences.length - blocking
    };
  };
  if (fixtureDiagnosticsAllowed(raw.url, env)) {
    match_level = "fixture";
    return result("fixture");
  }
  let url;
  try {
    url = new URL(raw.url);
  } catch {
    return result("unsupported_template");
  }
  const path = url.pathname.replace(/\/$/, "");
  template = templates.find((t) => url.protocol === "https:" && url.hostname === t.host && path === t.path && (!t.company || url.searchParams.get("CtmID")?.toLowerCase() === t.company));
  platform = platformForUrl(url);
  if (template) {
    match_level = "verified_template";
    platform = platforms.find((p) => p.family === template.family);
    if (template.status === "in_development") return result("template_in_development");
  }
  const recipe2 = recipeFor(raw.fields);
  if (!raw.fields.some((f2) => f2.plannerFamily && !isButton(f2)) && !raw.workflow) return result("not_resume_form");
  if (!template) {
    if (platform) {
      if (!platform.compatible) return result("unsupported_template");
      match_level = "compatible_platform";
      if (recipe2?.family !== platform.family) {
        differences.push({ code: "form_family_changed" });
        return result("page_changed");
      }
    } else if (recipe2) {
      platform = platforms.find((p) => p.family === recipe2.family && p.compatible);
      if (platform) {
        match_level = "platform_candidate";
        differences.push({ code: "origin_not_trusted" });
        return result("platform_candidate");
      }
      return result("unsupported_template");
    } else return result("unsupported_template");
  }
  const family = template?.family ?? platform.family;
  if (recipe2?.family !== family && !(family === "job51" && raw.workflow && !recipe2)) differences.push({ code: "form_family_changed" });
  if (template?.steps) {
    const w = raw.workflow;
    if (!w || w.steps.length !== template.steps.length || w.steps.some((s, i) => !template.steps[i]?.includes(s)) || w.current < 0 || w.current >= w.steps.length || !w.heading.startsWith(w.steps[w.current])) differences.push({ code: "workflow_changed" });
  }
  const rules = recipes.find((r) => r.family === family);
  for (const section of raw.sections) if (rules.sections.some((rule) => rule.sections.includes(section))) observedModuleSet.add(section);
  for (const field of raw.fields) if (field.plannerFamily === family && rules.sections.some((rule) => rule.sections.includes(sectionOf(field.scope)))) observedModuleSet.add(sectionOf(field.scope));
  const evidenceModules = template?.modules ?? platformModules(platform);
  const reportedModules = /* @__PURE__ */ new Set();
  for (const f2 of raw.fields) {
    if (isButton(f2) || f2.disabled || manualReason(f2)) continue;
    if (!f2.plannerFamily) {
      if (f2.required) differences.push({ code: "unrecognized_required_control", scope: f2.scope, field: f2.label, required: true });
      continue;
    }
    const section = sectionOf(f2.scope);
    const sectionRule = rules.sections.find((r) => r.sections.includes(section));
    if (!sectionRule) {
      if (!reportedModules.has(section)) {
        differences.push({ code: f2.required ? "unknown_required_module" : "unknown_module", scope: section, required: f2.required });
        reportedModules.add(section);
      }
      continue;
    }
    if (!evidenceModules.includes(section) && !reportedModules.has(section)) {
      differences.push({ code: "unverified_module", scope: section, required: false });
      reportedModules.add(section);
    }
    const unmapped = template?.observed_unmapped?.find((o) => o.section === section && o.labels.includes(f2.label));
    if (unmapped) {
      if (unmapped.modes && !unmapped.modes.includes(f2.inputMode)) differences.push({ code: "control_kind_changed", scope: f2.scope, field: f2.label, required: f2.required });
      known_unmapped_fields.push({ scope: f2.scope, field: f2.label, required: f2.required });
      continue;
    }
    const group = raw.fields.find((g) => g.frame === f2.frame && g.scope === f2.scope && g.role === "date-group" && f2.label.startsWith(`${g.label} / `));
    const label2 = group?.label ?? f2.label;
    const semanticLabel = family === "job51" ? label2.replace(/^(博士|硕士|本科|大专)(是否统招|是否专升本|是否有海外留学经历|担任职务|班级排名|专业排名)$/, "$2") : label2;
    const matches2 = fieldRules(sectionRule, semanticLabel, template?.company ?? null);
    if (!matches2.length && !sectionRule.negative?.includes(label2)) differences.push({ code: f2.required ? "unknown_required_field" : "unknown_field", scope: f2.scope, field: f2.label, required: f2.required });
    else if (!kindSupported(f2, matches2.map((m) => m.key), Boolean(group))) differences.push({ code: "unsupported_control_kind", scope: f2.scope, field: f2.label, required: f2.required });
    else fillable.add(section);
  }
  return result(differences.some(blockingDifference) ? "page_changed" : "supported_partial");
}
var UnsupportedFormError = class extends Error {
  constructor(support) {
    super("form_not_supported");
    this.support = support;
  }
  support;
  code = "form_not_supported";
};
function assertSupportedForm(raw) {
  const report = inspectSupport(raw);
  if (!report.autofill_allowed) throw new UnsupportedFormError(report);
}

// src/browser/form-engine.ts
var DEFAULT_MAX_BYTES = 12e3;
var MAX_MAX_BYTES = 8e4;
var HISTORY_LIMIT = 8;
var ACTION_TIMEOUT = 4e3;
var OBSERVE_FRAME_TIMEOUT = 3500;
var sensitiveLabelPattern = /(身份证|证件|护照|手机号|联系电话|手机号码|电子邮箱|邮箱|住址|地址|账号|银行卡)/i;
var fieldControlRoles = ["input", "textarea", "select", "textbox", "combobox", "checkbox", "radio", "switch", "button"];
var optionRoles = ["option", "treeitem", "menuitem", "menuitemcheckbox", "menuitemradio", "li", "button"];
function normalize(value) {
  return String(value ?? "").replace(/[\s*：:]+/g, "").trim().toLowerCase();
}
function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
function slug(value) {
  const normalized2 = normalize(value);
  if (!normalized2) return "unnamed";
  const latin = normalized2.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return latin.slice(0, 56) || "unnamed";
}
function shortHash(value) {
  return createHash2("sha256").update(value).digest("hex").slice(0, 7);
}
function navigationId(url, documentId = "") {
  return `nav_${shortHash(`${url}|${documentId}`)}`;
}
function fieldKind(field) {
  if (field.role === "date-group") return "date_group";
  if (field.type === "checkbox" || field.role === "checkbox" || field.role === "switch") return "checkbox";
  if (field.type === "radio" || field.role === "radio") return "radio";
  if (field.tag === "select") return "select";
  if (field.inputMode === "date" || field.type === "date" || field.type === "month" || field.type === "datetime-local") return "date";
  if (field.tag === "textarea") return "textarea";
  if (field.tag === "button" || field.role === "button") return "button";
  if (field.role === "combobox") return "combobox";
  if (field.role === "treeitem") return "treeitem";
  return "text";
}
function maskEmail(value) {
  const [name, domain] = value.split("@");
  if (!name || !domain) return "<masked>";
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(2, Math.min(6, name.length - visible.length)))}@${domain}`;
}
function maskSensitiveValue(label2, value) {
  const text3 = cleanText(value);
  if (!text3) return "";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text3)) return maskEmail(text3);
  if (/^1\d{10}$/.test(text3)) return `${text3.slice(0, 3)}****${text3.slice(-4)}`;
  if (/^\d{15}$|^\d{17}[\dXx]$/.test(text3)) return `${text3.slice(0, 3)}***********${text3.slice(-4)}`;
  if (sensitiveLabelPattern.test(label2)) {
    if (text3.length <= 4) return "<masked>";
    return `${text3.slice(0, 2)}***${text3.slice(-2)}`;
  }
  return text3;
}
function publicValue(field, includeValues, target) {
  if (field.checked !== null) return field.checked;
  if (!field.value) return void 0;
  if (includeValues === "state") return void 0;
  const needed = includeValues === "needed" && target && normalize(field.label).includes(normalize(target));
  if (needed && !sensitiveLabelPattern.test(field.label)) return cleanText(field.value).slice(0, 300);
  return maskSensitiveValue(field.label, field.value).slice(0, 300);
}
function fieldState(field) {
  if (field.disabled) return "disabled";
  if (field.checked !== null) return field.checked ? "selected" : "blank";
  return field.value ? "filled" : "blank";
}
function isRelevant(text3, target, scope) {
  const normalizedText = normalize(text3);
  const normalizedTarget = normalize(target);
  const normalizedScope = normalize(scope) === "page" ? "" : normalize(scope);
  return (!normalizedTarget || normalizedText.includes(normalizedTarget) || normalizedTarget.includes(normalizedText)) && (!normalizedScope || normalizedText.includes(normalizedScope) || normalizedScope.includes(normalizedText));
}
function structuralHash(raw) {
  const structure = {
    fields: raw.fields.map((field) => [normalize(field.scope), normalize(field.label), fieldKind(field), field.disabled]),
    overlays: raw.overlays.map((overlay) => [overlay.role, normalize(overlay.label), overlay.options.map(normalize)]),
    sections: raw.sections.map(normalize)
  };
  return shortHash(JSON.stringify(structure));
}
function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function contentResult(data, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
    ...isError ? { isError: true } : {}
  };
}
function codedError(code, message, details = {}) {
  return contentResult({ ok: false, ...typeof details.generation === "number" ? { generation: details.generation } : {}, error: { code, message, ...details } }, true);
}
function errorCode(error2) {
  if (error2 instanceof ControlFailure) return error2.code;
  const message = error2 instanceof Error ? error2.message : String(error2);
  if (/abort|operation_cancelled/i.test(message)) return "operation_cancelled";
  if (/observe_timeout|phase=.*timeout|timed out/i.test(message)) return "operation_timeout";
  if (/ambiguous/i.test(message)) return "target_ambiguous";
  if (/not found|unresolved|no candidate/i.test(message)) return "target_unresolved";
  if (/constraint/i.test(message)) return "constraint_violation";
  if (/manual_boundary/i.test(message)) return "manual_boundary";
  if (/unknown/i.test(message)) return "action_result_unknown";
  return "postcondition_failed";
}
function domFunction(method, parameters) {
  return new Function(...parameters, `return (${createDomFormRuntime.toString()})().${method}(${parameters.join(",")});`);
}
var collectDomForm = domFunction("collect", []);
var findSemanticCandidates = domFunction("candidates", ["spec"]);
var resolveSemanticElement = domFunction("resolve", ["spec"]);
var atomicSetValue = domFunction("setValue", ["spec", "value"]);
var hasDomOverlay = domFunction("hasOverlay", ["spec"]);
var atomicClick = domFunction("click", ["spec"]);
var FormEngine = class {
  constructor(getPage, writePolicy) {
    this.getPage = getPage;
    this.writePolicy = writePolicy;
  }
  getPage;
  writePolicy;
  states = /* @__PURE__ */ new Map();
  ledger = /* @__PURE__ */ new Map();
  completedOperations = /* @__PURE__ */ new Map();
  activeSignal;
  expiredOperations = /* @__PURE__ */ new Set();
  fieldPages = /* @__PURE__ */ new Map();
  runs = /* @__PURE__ */ new Map();
  actionStartedAt = 0;
  runBindings = /* @__PURE__ */ new Map();
  requireSupported(raw) {
    this.writePolicy?.(raw);
  }
  clear() {
    this.states.clear();
    this.ledger.clear();
    this.completedOperations.clear();
    this.expiredOperations.clear();
    this.fieldPages.clear();
    this.runs.clear();
    this.runBindings.clear();
  }
  async captureRun(pageId, signal) {
    this.activeSignal = signal;
    signal?.throwIfAborted();
    const raw = await this.collect(pageId);
    signal?.throwIfAborted();
    const state = this.updateState(pageId, raw);
    return { raw, navigationId: state.navigationId, generation: state.generation };
  }
  getRunBinding(token, pageId, navigationId2, observationId) {
    const binding = this.runBindings.get(token);
    return binding && binding.pageId === pageId && binding.navigationId === navigationId2 && binding.observationId === observationId ? structuredClone(binding) : void 0;
  }
  async capturePlanning(pageId, signal) {
    const state = await this.captureRun(pageId, signal);
    const observationId = `prepare_${randomUUID2()}`;
    const records = [];
    const scopes = new Set(state.raw.fields.filter((f2) => f2.tag !== "button" && f2.role !== "button").map((f2) => `${f2.frame}\0${f2.scope}`));
    for (const key2 of scopes) {
      const [frameText, scope = ""] = key2.split("\0"), frame = Number(frameText);
      const record2 = state.raw.records?.find((r) => r.scope === scope && r.frame === frame);
      const section = scope.replace(/ \/ 第\d+条$/, ""), binding = `record_${randomUUID2()}`;
      this.runBindings.set(binding, {
        pageId,
        navigationId: state.navigationId,
        observationId,
        scope,
        section,
        frame,
        ...record2 ? { identity: record2.identity } : {},
        fields: structuredClone(state.raw.fields.filter((f2) => f2.scope === scope && f2.frame === frame && f2.tag !== "button" && f2.role !== "button"))
      });
      records.push({ binding, scope, section, frame });
    }
    while (this.runBindings.size > 1e3) this.runBindings.delete(this.runBindings.keys().next().value);
    return { page_id: pageId, navigation_id: state.navigationId, observation_id: observationId, raw: state.raw, records };
  }
  async observe(request) {
    const maxBytes = Math.min(Math.max(request.max_bytes ?? DEFAULT_MAX_BYTES, 2e3), MAX_MAX_BYTES);
    const includeValues = request.include_values ?? "state";
    let raw;
    try {
      raw = await this.collect(request.page_id);
    } catch (error2) {
      const message = this.safeError(error2);
      const timeout = /observe_timeout|timed out|timeout/i.test(message);
      return codedError(timeout ? "observe_timeout" : "observe_evaluation_failed", message, {
        phase: "frame_semantic_scan",
        recovery: timeout ? "inspect_runtime_status_preserve_unsaved_page" : "inspect_scan_error",
        page_id: request.page_id
      });
    }
    const state = this.updateState(request.page_id, raw);
    if (request.cursor) {
      const [id3, offsetText] = request.cursor.split(":");
      const stored = this.fieldPages.get(id3);
      const offset = Number(offsetText);
      if (!stored || stored.pageId !== request.page_id || stored.generation !== state.generation || !Number.isInteger(offset) || offset < 0 || offset >= stored.fields.length)
        return codedError("observation_cursor_expired", "Re-observe after page changes or an expired cursor", { generation: state.generation });
      const snapshot2 = structuredClone(stored.snapshot);
      snapshot2.fields = structuredClone(stored.fields.slice(offset));
      return this.pageFields(snapshot2, stored.fields.length, offset, maxBytes);
    }
    const latest = state.latestObservationId ? state.snapshots.get(state.latestObservationId) : void 0;
    const observationId = `obs_${state.generation}_${randomUUID2().slice(0, 8)}`;
    const refs = /* @__PURE__ */ new Map();
    const publicFields = raw.fields.map((field) => {
      const base = `field:${slug(field.scope || "page")}/${slug(field.label || `${fieldKind(field)}-${field.index}`)}`;
      const occurrence = (refs.get(base) ?? 0) + 1;
      refs.set(base, occurrence);
      const ref = occurrence === 1 ? base : `${base}~${occurrence}`;
      state.refToTarget.set(ref, { label: field.label, scope: field.scope, ...field.identity ? { identity: field.identity } : {}, frame: field.frame });
      const value = publicValue(field, includeValues, request.target);
      const constraints = Object.values(field.constraints).some((item) => item !== null) ? field.constraints : void 0;
      return {
        ref,
        label: field.label,
        ...manualReason(field) ? { manual_reason: manualReason(field) } : {},
        ...field.scope ? { scope: field.scope } : {},
        kind: fieldKind(field),
        ...field.inputMode ? { input_mode: field.inputMode, commit_state: field.pendingInput ? "editing" : field.value || field.checked ? "committed" : "empty" } : {},
        state: fieldState(field),
        ...value !== void 0 ? { value } : {},
        ...field.required ? { required: true } : {},
        ...field.readonly ? { readonly: true } : {},
        ...field.disabled ? { disabled: true } : {},
        ...field.invalid ? { invalid: true } : {},
        ...field.error ? { error: field.error.slice(0, 300) } : {},
        ...constraints ? { constraints } : {},
        ...field.options.length ? { options: field.options.slice(0, 80) } : {}
      };
    });
    const fieldStates = Object.fromEntries(publicFields.map((field, index) => {
      const source = raw.fields[index];
      return [field.ref, createHash2("sha256").update(JSON.stringify({
        ...field,
        value: source.value,
        checked: source.checked
      })).digest("hex")];
    }));
    const expanded = request.target ? this.expandTarget(request.page_id, request.target, request.scope) : void 0;
    const relevant = (field) => request.target?.startsWith("field:") ? field.ref === request.target && (!request.scope || request.scope === "page" || normalize(field.scope) === normalize(request.scope)) : isRelevant(`${field.scope ?? ""} ${field.label}`, request.target, request.scope);
    let fields2 = publicFields;
    let overlays = raw.overlays.map((overlay) => ({ ...overlay, options: overlay.options.slice(0, 100) }));
    let sections = raw.sections;
    const rawValidations = raw.validations.map((item) => item.slice(0, 300));
    let validations = rawValidations;
    let locality;
    if (request.mode === "focus") {
      fields2 = publicFields.filter((field) => relevant(field));
      overlays = overlays.filter((overlay) => !request.target || isRelevant(`${overlay.label} ${overlay.options.join(" ")}`, expanded?.label ?? request.target));
      sections = sections.filter((section) => !request.scope || isRelevant(section, void 0, request.scope));
      if (latest) {
        const now2 = new Map(publicFields.map((field) => [field.ref, field]));
        const changedOutside = publicFields.filter((field) => latest.fieldStates[field.ref] !== fieldStates[field.ref] && !relevant(field));
        const removedOutside = latest.fields.filter((field) => !now2.has(field.ref) && !relevant(field));
        locality = {
          mode: "focused",
          changed_outside_scope: changedOutside.length,
          removed_outside_scope: removedOutside.length,
          outside_change_labels: changedOutside.slice(0, 12).map((field) => field.label),
          widen_recommended: changedOutside.length + removedOutside.length > 0
        };
      }
    }
    if (request.mode === "focus" && request.target && !fields2.length && !overlays.length) {
      return codedError("target_unresolved", "No field or overlay matches the requested target and scope", { target: request.target, generation: state.generation });
    }
    if (request.mode === "overview") {
      overlays = overlays.map((overlay) => ({ ...overlay, options: overlay.options.slice(0, 20) }));
    }
    const previous = request.since_observation_id ? state.snapshots.get(request.since_observation_id) : void 0;
    let changes;
    if (request.mode === "delta") {
      if (!previous) {
        return codedError("observation_not_found", "\u6307\u5B9A\u7684 observation \u5DF2\u8FC7\u671F\uFF0C\u8BF7\u6267\u884C\u4E00\u6B21 overview \u6216 focus \u89C2\u5BDF", {
          current_generation: state.generation
        });
      }
      const now2 = new Map(publicFields.map((field) => [field.ref, field]));
      const allChanged = publicFields.filter((field) => previous.fieldStates[field.ref] !== fieldStates[field.ref]);
      const allRemoved = previous.fields.filter((field) => !now2.has(field.ref));
      const focused2 = Boolean(request.target || request.scope);
      const localChanged = focused2 ? allChanged.filter((field) => relevant(field)) : allChanged;
      const localRemoved = focused2 ? allRemoved.filter((field) => relevant(field)) : allRemoved;
      const outsideChanged = focused2 ? allChanged.filter((field) => !localChanged.includes(field)) : [];
      const outsideRemoved = focused2 ? allRemoved.filter((field) => !localRemoved.includes(field)) : [];
      changes = {
        fields: localChanged,
        removed_refs: localRemoved.map((field) => field.ref),
        overlays_changed: !sameJson(previous.overlays, raw.overlays),
        validations_changed: !sameJson(previous.validations, rawValidations)
      };
      if (focused2) {
        locality = {
          mode: "focused",
          changed_outside_scope: outsideChanged.length,
          removed_outside_scope: outsideRemoved.length,
          outside_change_labels: outsideChanged.slice(0, 12).map((field) => field.label),
          widen_recommended: outsideChanged.length + outsideRemoved.length > 0
        };
      }
      fields2 = changes.fields;
      sections = [];
      overlays = changes.overlays_changed ? overlays : [];
      validations = changes.validations_changed ? validations : [];
    }
    const records = [];
    if (request.mode !== "delta") {
      const scopes = new Set(raw.fields.filter((f2) => f2.tag !== "button" && f2.role !== "button").map((f2) => `${f2.frame}\0${f2.scope}`));
      for (const key2 of scopes) {
        const [frameText, scope = ""] = key2.split("\0");
        const frame = Number(frameText);
        const record2 = raw.records?.find((r) => r.scope === scope && r.frame === frame);
        const section = scope.replace(/ \/ 第\d+条$/, "");
        const binding = `record_${randomUUID2()}`;
        this.runBindings.set(binding, {
          pageId: request.page_id,
          navigationId: state.navigationId,
          observationId,
          scope,
          section,
          frame,
          ...record2 ? { identity: record2.identity } : {},
          fields: structuredClone(raw.fields.filter((f2) => f2.scope === scope && f2.frame === frame && f2.tag !== "button" && f2.role !== "button"))
        });
        records.push({ binding, scope, section });
      }
      while (this.runBindings.size > 1e3) this.runBindings.delete(this.runBindings.keys().next().value);
    }
    const snapshot = {
      observation_id: observationId,
      page_id: request.page_id,
      navigation_id: state.navigationId,
      generation: state.generation,
      mode: request.mode,
      ...request.target ? { target: request.target } : {},
      ...request.scope ? { scope: request.scope } : {},
      page: { title: raw.title.slice(0, 200), url: raw.url.split("#")[0]?.slice(0, 500) ?? raw.url.slice(0, 500) },
      sections,
      ...records.length ? { records } : {},
      fields: fields2,
      manual_tasks: manualTasks(raw).slice(0, 20),
      manual_task_count: manualTasks(raw).length,
      overlays,
      validations,
      ...changes ? { changes } : {},
      ...locality ? { locality } : {},
      truncated: false,
      omitted_counts: { fields: 0, options: 0, sections: 0, validations: 0 },
      metrics: { response_bytes: 0, observed_fields: raw.fields.length, returned_fields: fields2.length },
      ...request.include_test_ledger ? this.ledgerPage(request.page_id, request.ledger_cursor ?? 0, request.ledger_limit ?? 0) : {}
    };
    if (request.mode !== "delta") {
      this.fieldPages.set(observationId, { pageId: request.page_id, generation: state.generation, snapshot: structuredClone(snapshot), fields: structuredClone(fields2) });
      while (this.fieldPages.size > 16) this.fieldPages.delete(this.fieldPages.keys().next().value);
    }
    const cached2 = {
      observationId,
      structuralHash: structuralHash(raw),
      fields: publicFields,
      fieldStates,
      overlays: raw.overlays,
      validations: rawValidations
    };
    state.snapshots.set(observationId, cached2);
    state.latestObservationId = observationId;
    while (state.snapshots.size > HISTORY_LIMIT) {
      const oldest = state.snapshots.keys().next().value;
      if (!oldest) break;
      state.snapshots.delete(oldest);
    }
    return this.pageFields(snapshot, fields2.length, 0, maxBytes);
  }
  pageFields(snapshot, total, offset, maxBytes) {
    snapshot.fields = [...snapshot.fields];
    if (snapshot.changes) snapshot.changes.fields = snapshot.fields;
    this.fitBudget(snapshot, maxBytes - 500);
    const end = offset + snapshot.fields.length;
    snapshot.coverage = {
      total_fields: total,
      offset,
      returned_fields: snapshot.fields.length,
      complete: end >= total,
      ...end < total && snapshot.mode !== "delta" ? { next_cursor: `${snapshot.observation_id}:${end}` } : {}
    };
    snapshot.metrics.returned_fields = snapshot.fields.length;
    snapshot.metrics.response_bytes = Buffer.byteLength(JSON.stringify(snapshot), "utf8");
    if (snapshot.metrics.response_bytes > maxBytes) return codedError("observation_budget_too_small", "Increase max_bytes or focus a section; no complete inventory was returned");
    return contentResult(snapshot);
  }
  ledgerPage(pageId, cursor, limit) {
    const entries = this.ledger.get(pageId) ?? [];
    const run = this.runs.get(pageId);
    const first = (run?.total ?? 0) - entries.length;
    const start = Math.max(cursor, first);
    const selected = entries.slice(start - first, start - first + Math.min(limit, 25));
    return { test_run: {
      run_id: run?.id ?? null,
      total_operations: run?.total ?? 0,
      counts: run?.counts ?? {},
      tool_elapsed_ms: run?.elapsed ?? 0,
      retained_from: first,
      next_cursor: limit && start + selected.length < (run?.total ?? 0) ? start + selected.length : null,
      details_requested: limit > 0,
      cursor_gap: cursor < first
    }, ...limit ? { test_ledger: selected } : {} };
  }
  appendLedger(pageId, entry) {
    const run = this.runs.get(pageId) ?? { id: randomUUID2(), total: 0, counts: {}, elapsed: 0 };
    run.total++;
    if (entry.action !== "form_batch") run.elapsed += entry.elapsed_ms ?? 0;
    const key2 = `${entry.tracking}:${entry.action}:${entry.result}`;
    run.counts[key2] = (run.counts[key2] ?? 0) + 1;
    this.runs.set(pageId, run);
    const entries = this.ledger.get(pageId) ?? [];
    entries.push(entry);
    this.ledger.set(pageId, entries.slice(-5e3));
  }
  async fillFields(params) {
    const preparation = await this.prepareAction({ ...params, expectedGeneration: void 0 });
    if (preparation) return preparation;
    const cached2 = this.operationResult(params, "form_fill_fields");
    if (cached2) return cached2;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    const beforeGeneration = this.currentGeneration(params.pageId);
    const results = [];
    for (const field of params.fields) {
      try {
        const target = this.expandTarget(params.pageId, field.field, field.scope);
        const candidate = await this.resolve(params.pageId, { ...target, field: target.label, roles: fieldControlRoles });
        if (manualReason(candidate.meta)) throw new ControlFailure("manual_boundary", "fill_preflight");
        const wanted = field.value;
        const currentMatches = this.valueMatches(candidate.meta, wanted);
        if (currentMatches) {
          results.push({ field: field.field, status: "unchanged" });
          continue;
        }
        if (!field.overwrite && this.hasExistingValue(candidate.meta)) {
          results.push({ field: field.field, status: "preserved", reason: "existing_value" });
          continue;
        }
        const constraint = this.constraintError(candidate.meta, wanted);
        if (constraint) {
          results.push({ field: field.field, status: "constraint_violation", constraint });
          continue;
        }
        await this.fillResolved(params.pageId, { ...target, field: target.label, roles: fieldControlRoles }, wanted);
        await this.settleInput(params.pageId, { ...target, field: target.label, roles: fieldControlRoles });
        const after = await this.resolve(params.pageId, { ...target, field: target.label, roles: fieldControlRoles });
        results.push(this.valueMatches(after.meta, wanted) && !after.meta.invalid ? { field: field.field, status: "filled" } : { field: field.field, status: "postcondition_failed", state: this.safeCandidateState(after.meta) });
      } catch (error2) {
        results.push({ field: field.field, status: errorCode(error2), message: this.safeError(error2) });
      }
    }
    for (let index = 0; index < results.length; index++) {
      const result2 = results[index];
      if (!["filled", "unchanged"].includes(result2.status)) continue;
      const field = params.fields[index];
      try {
        const target = this.expandTarget(params.pageId, field.field, field.scope);
        const final = await this.resolve(params.pageId, { ...target, field: target.label, roles: fieldControlRoles });
        if (!this.valueMatches(final.meta, field.value) || final.meta.invalid) result2.status = "postcondition_failed";
      } catch {
        result2.status = "postcondition_failed";
      }
    }
    const ok = results.every((result2) => result2.status === "filled" || result2.status === "unchanged" || result2.status === "preserved");
    const attempted = results.some((result2) => !["unchanged", "preserved", "constraint_violation"].includes(String(result2.status)));
    const generation = attempted ? await this.advanceGeneration(params.pageId, beforeGeneration) : this.currentGeneration(params.pageId);
    const result = contentResult({ ok, operation_id: params.operationId ?? randomUUID2(), generation, results, change_summary: this.summarize(results) }, !ok);
    this.recordOperation(params, "form_fill_fields", `${params.fields.length} fields`, ok ? "completed" : "partial", result);
    return result;
  }
  async executeBatch(params) {
    if (!params.scope || !params.steps.length || params.steps.length > 16)
      return codedError("invalid_arguments", "A batch requires one observed record scope and 1\u201316 steps");
    const preparation = await this.prepareAction({ ...params, expectedGeneration: void 0 });
    if (preparation) return preparation;
    const cached2 = this.operationResult(params, "form_batch");
    if (cached2) return cached2;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    const operationId = params.operationId ?? randomUUID2();
    const initialPage = await this.collect(params.pageId);
    const record2 = initialPage.records?.find((item) => item.scope === params.scope);
    if (!record2 && initialPage.records?.some((item) => item.scope.startsWith(`${params.scope} / `)))
      return codedError("target_ambiguous", "Choose one repeated record scope for this batch");
    const started = Date.now();
    const results = [];
    const checkpoints = [];
    const deadline = Date.now() + 6e4;
    const batchSignal = AbortSignal.any([AbortSignal.timeout(6e4), ...params.signal ? [params.signal] : []]);
    let stopped = false;
    for (const [index, step] of params.steps.entries()) {
      if (batchSignal.aborted || Date.now() >= deadline) {
        stopped = true;
        break;
      }
      if (record2 && !(await this.collect(params.pageId)).records?.some((item) => item.scope === params.scope && item.identity === record2.identity && item.frame === record2.frame)) {
        results.push({ index, action: step.action, status: "blocked", result: { error: { code: "record_changed" } } });
        stopped = true;
        break;
      }
      const context = { ...params, signal: batchSignal, operationId: `${operationId}:${index}`, expectedGeneration: this.currentGeneration(params.pageId), timeoutMs: Math.max(1, deadline - Date.now()) };
      let result2;
      if (step.action === "fill") {
        result2 = await this.fillFields({ ...context, fields: step.fields.map((field) => ({ ...field, scope: params.scope })) });
      } else if (step.action === "select") {
        result2 = await this.selectOption({ ...context, field: step.field, value: step.value ?? "", values: step.values, selectionMode: step.selection_mode, query: step.query, allowCustom: step.allow_custom, overwrite: step.overwrite });
      } else if (step.action === "date") {
        result2 = await this.setDate({ ...context, field: step.field, value: step.value ?? "", range: step.range, overwrite: step.overwrite });
      } else {
        result2 = codedError("invalid_arguments", "Only fill/select/date steps are supported in a record batch");
      }
      const data = result2.structuredContent;
      const succeeded = !result2.isError && data?.ok !== false && data?.status !== "preserved" && !data?.results?.some((item) => !["filled", "unchanged"].includes(item.status));
      results.push({ index, action: step.action, status: succeeded ? "verified_ui" : "blocked", result: data });
      if (!succeeded) {
        stopped = true;
        break;
      }
      if (step.action === "fill") checkpoints.push(...step.fields.map((f2) => ({ field: f2.field, value: f2.value })));
      else if (step.action === "select") checkpoints.push({ field: step.field, value: step.value ?? "", ...step.values ? { values: data.selected ?? step.values } : {} });
      else checkpoints.push({ field: step.field, date: true, value: step.range ? `${step.range.start} / ${step.range.current ? "\u81F3\u4ECA" : step.range.end}` : step.value });
    }
    const verification = [];
    if (!params.signal?.aborted) for (const check2 of checkpoints) {
      try {
        const target = this.expandTarget(params.pageId, check2.field, params.scope);
        const { meta } = await this.resolve(params.pageId, { ...target, field: target.label });
        const matched = check2.values ? meta.value.split(" / ").filter(Boolean).length === check2.values.length && check2.values.every((value) => meta.value.split(" / ").some((part) => sameValue(part, value))) : check2.date ? sameValue(meta.value, String(check2.value)) || readCalendarText(meta.value) === String(check2.value) : this.valueMatches(meta, check2.value);
        verification.push({ field: check2.field, matched: matched && !meta.invalid });
      } catch {
        verification.push({ field: check2.field, matched: false });
      }
    }
    const recordUnchanged = !record2 || !batchSignal.aborted && Boolean((await this.collect(params.pageId)).records?.some((item) => item.scope === params.scope && item.identity === record2.identity && item.frame === record2.frame));
    const ok = recordUnchanged && !batchSignal.aborted && !stopped && results.length === params.steps.length && verification.every((item) => item.matched);
    const result = contentResult({
      ok,
      operation_id: operationId,
      generation: this.currentGeneration(params.pageId),
      scope: params.scope,
      status: ok ? "verified_ui" : "partial",
      results,
      verification,
      blocked_step: results.find((item) => item.status === "blocked")?.index ?? null,
      next_step: results.length < params.steps.length ? results.length : null,
      remaining_steps: params.steps.slice(results.length).map((step, index) => ({ index: index + results.length, action: step.action })),
      recovery: ok ? void 0 : "Inspect the blocked step and failed final checks; do not replay completed steps. Use a new operation ID for the corrected remainder.",
      record_unchanged: recordUnchanged,
      elapsed_ms: Date.now() - started,
      persistence: "unknown"
    }, !ok);
    this.recordOperation({ ...params, operationId }, "form_batch", params.scope, ok ? "completed" : "partial", result);
    return result;
  }
  async selectOption(params) {
    if (Boolean(params.value) === Boolean(params.values)) return codedError("invalid_arguments", "Provide either value or values");
    const preparation = await this.prepareAction({ ...params, expectedGeneration: void 0 });
    if (preparation) return preparation;
    const cached2 = this.operationResult(params, "form_select_option");
    if (cached2) return cached2;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    const controlled = await this.runControl(params, "form_select_option");
    if (controlled) return controlled;
    const beforeGeneration = this.currentGeneration(params.pageId);
    const target = this.expandTarget(params.pageId, params.field, params.scope);
    let sideEffect = "none";
    try {
      const triggerSpec = { ...target, field: target.label, roles: fieldControlRoles };
      const trigger = await this.resolve(params.pageId, triggerSpec);
      if (trigger.meta.tag === "button") Object.assign(target, { identity: trigger.meta.identity, frame: trigger.meta.frame });
      Object.assign(triggerSpec, target);
      if (trigger.meta.tag === "select") {
        const unchanged = this.valueMatches(trigger.meta, params.value);
        if (unchanged || !params.overwrite && this.hasExistingValue(trigger.meta)) {
          const status = unchanged ? "unchanged" : "preserved";
          const result2 = contentResult({ ok: true, status, generation: beforeGeneration, field: params.field, verification: { level: "ui", matched: unchanged } });
          this.recordOperation(params, "form_select_option", params.field, status, result2);
          return result2;
        }
        await this.fillResolved(params.pageId, triggerSpec, params.value);
        sideEffect = "option_attempted";
      } else if (trigger.meta.type === "radio" || trigger.meta.type === "checkbox") {
        const option = await this.resolve(params.pageId, { field: params.value, scope: target.scope, roles: ["radio", "checkbox"] });
        if (!this.valueMatches(option.meta, true)) {
          await this.clickResolved(params.pageId, { field: option.meta.label, scope: option.meta.scope, roles: ["radio", "checkbox"] }, true);
          sideEffect = "option_attempted";
        }
      } else {
        const optionSpec = { ...target, field: target.label, option: params.value, roles: optionRoles };
        let option = await this.resolve(params.pageId, optionSpec).catch(() => null);
        if (!option) {
          try {
            if (!await this.hasTargetOverlay(params.pageId, triggerSpec)) await this.clickResolved(params.pageId, triggerSpec, true);
            sideEffect = "overlay_opened";
          } catch (openError) {
            let optionError;
            option = await this.waitResolve(params.pageId, optionSpec).catch((error2) => {
              optionError = error2;
              return null;
            });
            if (!option) throw new Error(`${this.safeError(openError)}; option_resolution=${this.safeError(optionError)}`);
            sideEffect = "overlay_opened";
          }
          if (params.query) await this.fillResolved(params.pageId, triggerSpec, params.query);
          option ??= await this.waitResolve(params.pageId, optionSpec);
        }
        try {
          await this.clickResolved(params.pageId, optionSpec, true);
          sideEffect = "option_attempted";
        } catch (clickError) {
          const selectedDespiteError = await this.verifySelected(params.pageId, target, params.value);
          if (!selectedDespiteError && !await this.keyboardConfirmActiveOption(params.pageId, params.value)) throw clickError;
          sideEffect = "option_attempted";
        }
      }
      await this.delay(30);
      const verified = await this.verifySelected(params.pageId, target, params.value);
      const generation = await this.advanceGeneration(params.pageId, beforeGeneration);
      const data = {
        ok: verified,
        operation_id: params.operationId ?? randomUUID2(),
        generation,
        field: params.field,
        selected: params.value,
        field_state: verified ? "selected" : "unknown",
        overlay: await this.overlayState(params.pageId)
      };
      const result = contentResult(data, !verified);
      this.recordOperation(params, "form_select_option", params.field, verified ? "completed" : "unknown", result);
      return result;
    } catch (error2) {
      const overlay = await this.overlayState(params.pageId);
      const generation = await this.advanceGeneration(params.pageId, beforeGeneration);
      const partial2 = sideEffect !== "none" || overlay === "open";
      const result = codedError(partial2 ? "action_result_unknown" : errorCode(error2), this.safeError(error2), {
        field: params.field,
        value: params.value,
        generation,
        status: partial2 ? "partial" : "failed",
        side_effects: sideEffect,
        overlay,
        recovery: overlay === "open" ? "observe the focused overlay; do not reopen the trigger" : "focus-observe the field and retry once"
      });
      this.recordOperation(params, "form_select_option", params.field, partial2 ? "partial" : "failed", result);
      return result;
    }
  }
  async selectPath(params) {
    const preparation = await this.prepareAction({ ...params, expectedGeneration: void 0 });
    if (preparation) return preparation;
    const cached2 = this.operationResult(params, "form_select_path");
    if (cached2) return cached2;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    const controlled = await this.runControl(params, "form_select_path");
    if (controlled) return controlled;
    const beforeGeneration = this.currentGeneration(params.pageId);
    const target = this.expandTarget(params.pageId, params.field, params.scope);
    const completed = [];
    let overlayOpened = false;
    try {
      const triggerSpec = { ...target, field: target.label, roles: fieldControlRoles };
      const trigger = await this.resolve(params.pageId, triggerSpec);
      if (trigger.meta.tag === "button") Object.assign(target, { identity: trigger.meta.identity, frame: trigger.meta.frame });
      Object.assign(triggerSpec, target);
      const firstOption = { ...target, field: target.label, option: params.path[0], optionLevel: 0, roles: optionRoles };
      if (!await this.resolve(params.pageId, firstOption).then(() => true).catch(() => false)) {
        try {
          if (!await this.hasTargetOverlay(params.pageId, triggerSpec)) await this.clickResolved(params.pageId, triggerSpec, true);
          overlayOpened = true;
        } catch (openError) {
          if (!await this.waitResolve(params.pageId, firstOption).then(() => true).catch(() => false)) throw openError;
          overlayOpened = true;
        }
      } else {
        overlayOpened = true;
      }
      for (const [index, segment] of params.path.entries()) {
        const option = await this.waitResolve(params.pageId, { ...target, field: target.label, option: segment, optionLevel: index, roles: optionRoles });
        try {
          await this.clickResolved(params.pageId, { ...target, field: target.label, option: segment, optionLevel: index, roles: optionRoles }, true);
        } catch (clickError) {
          const nextSegment = params.path[index + 1];
          const advancedDespiteError = nextSegment ? await this.waitResolve(params.pageId, { ...target, field: target.label, option: nextSegment, optionLevel: index + 1, roles: optionRoles }).then(() => true).catch(() => false) : await this.verifySelected(params.pageId, target, segment);
          if (!advancedDespiteError) throw clickError;
        }
        completed.push(segment);
        await this.delay(35);
      }
      const verified = await this.verifySelected(params.pageId, target, params.path.join(" / "));
      const generation = await this.advanceGeneration(params.pageId, beforeGeneration);
      const data = {
        ok: verified,
        operation_id: params.operationId ?? randomUUID2(),
        generation,
        field: params.field,
        requested_path: params.path,
        completed_path: completed,
        field_state: verified ? "selected" : "partial",
        overlay: await this.overlayState(params.pageId)
      };
      const result = contentResult(data, !verified);
      this.recordOperation(params, "form_select_path", params.field, verified ? "completed" : "partial", result);
      return result;
    } catch (error2) {
      const overlay = await this.overlayState(params.pageId);
      const generation = await this.advanceGeneration(params.pageId, beforeGeneration);
      const partial2 = overlayOpened || completed.length > 0 || overlay === "open";
      const result = codedError(partial2 ? "action_result_unknown" : errorCode(error2), this.safeError(error2), {
        field: params.field,
        requested_path: params.path,
        completed_path: completed,
        failed_level: completed.length,
        generation,
        status: partial2 ? "partial" : "failed",
        side_effects: overlayOpened ? "overlay_opened" : "none",
        overlay,
        recovery: overlay === "open" ? "continue from the visible candidate layer; do not reopen the trigger" : "focus-observe the field and retry once"
      });
      this.recordOperation(params, "form_select_path", params.field, partial2 ? "partial" : "failed", result);
      return result;
    }
  }
  async setDate(params) {
    if (Boolean(params.value) === Boolean(params.range)) return codedError("invalid_arguments", "Provide either value or range");
    const preparation = await this.prepareAction({ ...params, expectedGeneration: void 0 });
    if (preparation) return preparation;
    const cached2 = this.operationResult(params, "form_set_date");
    if (cached2) return cached2;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    return await this.runControl(params, "form_set_date");
  }
  async runControl(params, action) {
    const before = this.currentGeneration(params.pageId);
    const target = this.expandTarget(params.pageId, params.field, params.scope);
    const driver = new ControlDriver(this.getPage(params.pageId).pptrPage, { ...target, field: target.label }, params);
    try {
      const state = await driver.read();
      if (state.family === "guopin-path" && action === "form_select_option") throw new ControlFailure("path_required", "path_preflight");
      if (action === "form_select_path" && !["guopin-path", "ant-path", "el-path", "sd-select"].includes(state.family) || action === "form_select_option" && !state.nativeOptions && !["guopin-certificates", "dayee-dictionary", "ant-select", "el-select", "sd-select", "ud-select", "phoenix-select", "phoenix-radio", "ant-radio", "phoenix-autocomplete", "job51-autocomplete"].includes(state.family)) {
        if (params.values) throw new ControlFailure("unsupported_component", "multiple_probe");
        return null;
      }
      let outcome;
      if (action === "form_set_date") {
        if (state.splitDate) {
          if (params.endField || params.currentField) throw new ControlFailure("invalid_group_endpoints", "range_parse");
          outcome = await driver.setSplitDate(params.range ?? params.value, params.overwrite);
        } else if (params.range) {
          if (params.endField || params.range.current) outcome = await this.setSeparateRange(params, driver);
          else if (params.range.end) outcome = await driver.setRange(params.range.start, params.range.end, params.overwrite);
          else throw new ControlFailure("missing_range_end", "range_parse");
        } else outcome = await driver.setDate(params.value, params.overwrite);
      } else if (action === "form_select_path") outcome = await driver.selectPath(params.path, params.overwrite);
      else if (params.values) outcome = await driver.selectMany(params.values, params.selectionMode, params.overwrite);
      else outcome = await driver.selectOption(params.value, params.overwrite, params.query, void 0, params.allowCustom);
      const generation = driver.tx.dispatched ? await this.advanceGeneration(params.pageId, before) : this.currentGeneration(params.pageId);
      const result = contentResult({ ...outcome, operation_id: params.operationId ?? randomUUID2(), generation, field: params.field, phase: driver.tx.phase, actions: driver.tx.actions });
      this.recordOperation(params, action, params.field, outcome.status, result);
      return result;
    } catch (error2) {
      const code = error2 instanceof ControlFailure ? error2.code : errorCode(error2);
      const phase = error2 instanceof ControlFailure ? error2.phase : driver.tx.phase;
      const popupClosed = params.cleanupOnFailure ? await driver.dismissOwnedPopup() : false;
      const generation = driver.tx.dispatched && !params.signal?.aborted ? await this.advanceGeneration(params.pageId, before) : this.currentGeneration(params.pageId);
      const evidence2 = await driver.read().catch(() => null);
      const result = codedError(code, "The requested control value could not be verified", {
        field: params.field,
        generation,
        status: driver.tx.dispatched ? "partial" : "blocked",
        phase,
        side_effects: driver.tx.dispatched ? "action_dispatched" : "none",
        verification: { level: "ui", matched: false },
        completed_path: driver.tx.progress,
        actions: driver.tx.actions,
        ...popupClosed ? { popup_cleanup: "closed" } : {},
        ...action === "form_set_date" ? { calendar_probes: driver.calendarProbes } : {},
        ...evidence2 ? { candidates: evidence2.options.slice(0, 40).map((option) => ({ label: option.label, disabled: option.disabled })), overlay: evidence2.expanded ? "open" : "closed", selected: evidence2.tags } : {}
      });
      this.recordOperation(params, action, params.field, "failed", result);
      return result;
    } finally {
      driver.close();
    }
  }
  async setSeparateRange(params, start) {
    const range2 = params.range;
    const a = parseCalendarValue(range2.start);
    const b = range2.end ? parseCalendarValue(range2.end) : null;
    if (!a || range2.current && range2.end || !range2.current && (!b || a.precision !== b.precision || range2.start > range2.end)) throw new ControlFailure("constraint_violation", "range_parse");
    if (!params.endField || range2.current && !params.currentField) throw new ControlFailure("missing_range_fields", "range_parse");
    const make = (field) => {
      const target = this.expandTarget(params.pageId, field, params.scope);
      if (manualReason(target)) throw new ControlFailure("manual_boundary", "range_preflight");
      return new ControlDriver(this.getPage(params.pageId).pptrPage, { ...target, field: target.label }, { ...params, transaction: start.tx });
    };
    const end = make(params.endField);
    const current = params.currentField ? make(params.currentField) : void 0;
    const before = await start.read(), endBefore = await end.read(), currentBefore = current ? await current.read() : void 0;
    if (before.scope !== endBefore.scope || before.document !== endBefore.document || currentBefore && (currentBefore.scope !== before.scope || currentBefore.document !== before.document)) throw new ControlFailure("range_scope_conflict", "range_preflight");
    if (currentBefore && !/(至今|目前|在职|present|current)/i.test(currentBefore.label)) throw new ControlFailure("unsupported_current_field", "range_preflight");
    if (before.disabled || currentBefore?.disabled || !range2.current && endBefore.disabled && !currentBefore?.checked) throw new ControlFailure("constraint_violation", "range_preflight");
    if (!params.overwrite && (before.value && readCalendarText(before.value) !== range2.start || endBefore.value && (range2.current || readCalendarText(endBefore.value) !== range2.end) || currentBefore?.checked && !range2.current)) {
      return { ok: true, status: "preserved", reason: "existing_value", verification: { level: "ui", matched: false } };
    }
    if (current && !range2.current) await current.setBoolean(false);
    await start.setDate(range2.start, true);
    if (range2.current) {
      await current.setBoolean(true);
      await start.tx.wait(() => end.read(), (state) => state.disabled || !state.value, "range_current_verify");
    } else await end.setDate(range2.end, true);
    const finalStart = await start.read(), finalEnd = await end.read();
    if (readCalendarText(finalStart.value) !== range2.start || !range2.current && readCalendarText(finalEnd.value) !== range2.end) throw new ControlFailure("postcondition_failed", "range_verify");
    return { ok: true, status: "verified_ui", range: range2, verification: { level: "ui", matched: true } };
  }
  async activate(params) {
    const preparation = await this.prepareAction({ ...params, expectedGeneration: void 0 });
    if (preparation) return preparation;
    const cached2 = this.operationResult(params, "form_activate");
    if (cached2) return cached2;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    if (isManualTarget(params.target, params.scope)) return codedError("manual_boundary", "\u8BE5\u63A7\u4EF6\u5FC5\u987B\u7531\u7528\u6237\u64CD\u4F5C", { target: params.target });
    const beforeGeneration = this.currentGeneration(params.pageId);
    let target = this.expandTarget(params.pageId, params.target, params.scope);
    if (manualReason(target)) return codedError("manual_boundary", "\u8BE5\u63A7\u4EF6\u5FC5\u987B\u7531\u7528\u6237\u64CD\u4F5C", { target: params.target });
    let actionStarted = false;
    const markStarted = () => {
      actionStarted = true;
    };
    if (params.intent === "close") {
      if (/^(取消|关闭|cancel|close)$/i.test(target.label.replace(/\s/g, ""))) {
        let dialog;
        try {
          const spec = { ...target, field: target.label, roles: ["button"] };
          const resolved = await this.resolve(params.pageId, spec);
          const button3 = await this.elementHandle(resolved, spec);
          try {
            dialog = await button3.evaluateHandle((el) => el.closest('[role="dialog"],.ant-modal') || (location.hostname === "c.iguopin.com" && location.pathname === "/resume" && /^(取消|cancel)$/i.test((el.textContent || "").replace(/\s/g, "")) ? el.closest(".item-section .edit-section") : null));
          } finally {
            await button3.dispose();
          }
          if (!dialog.asElement()) throw new Error("target_unresolved: close target is not inside a dialog");
          await this.clickResolved(params.pageId, spec, false, markStarted);
          const deadline = Date.now() + 1800;
          let closed = false;
          while (Date.now() < deadline) {
            this.activeSignal?.throwIfAborted();
            closed = await dialog.evaluate((el) => !el.isConnected || el.getBoundingClientRect().width === 0 || getComputedStyle(el).visibility === "hidden" || Boolean(el.closest('[hidden],[aria-hidden="true"]')));
            if (closed) break;
            await this.delay(60);
          }
          if (!closed) throw new Error("postcondition_failed: dialog_close");
          const generation = await this.advanceGeneration(params.pageId, beforeGeneration);
          const result = contentResult({ ok: true, operation_id: params.operationId ?? randomUUID2(), generation, target: params.target, intent: "close", result: "completed", overlay: "closed" });
          this.recordOperation(params, "form_activate", params.target, "completed", result);
          return result;
        } catch (error2) {
          const generation = actionStarted ? await this.advanceGeneration(params.pageId, beforeGeneration) : beforeGeneration;
          return codedError(errorCode(error2), this.safeError(error2), { generation, target: params.target, intent: "close", side_effects: actionStarted ? "action_may_have_started" : "none", overlay: "unknown" });
        } finally {
          await dialog?.dispose();
        }
      }
      const driver = new ControlDriver(this.getPage(params.pageId).pptrPage, { ...target, field: target.label }, params);
      try {
        await driver.dismissPopup();
        const generation = driver.tx.dispatched ? await this.advanceGeneration(params.pageId, beforeGeneration) : beforeGeneration;
        const result = contentResult({ ok: true, operation_id: params.operationId ?? randomUUID2(), generation, target: params.target, intent: "close", result: "completed", overlay: "closed" });
        this.recordOperation(params, "form_activate", params.target, "completed", result);
        return result;
      } catch (error2) {
        const generation = driver.tx.dispatched ? await this.advanceGeneration(params.pageId, beforeGeneration) : beforeGeneration;
        const state = await driver.read().catch(() => null);
        const result = codedError(errorCode(error2), this.safeError(error2), {
          generation,
          target: params.target,
          intent: "close",
          side_effects: driver.tx.dispatched ? "action_may_have_started" : "none",
          overlay: state?.expanded ? "open" : state ? "closed" : "unknown"
        });
        this.recordOperation(params, "form_activate", params.target, "failed", result);
        return result;
      } finally {
        driver.close();
      }
    }
    try {
      const before = await this.collect(params.pageId);
      if (params.intent === "next_step" && manualTasks(before).some((t) => t.blocks_navigation)) return codedError("manual_boundary", "\u8BF7\u5148\u5904\u7406\u672C\u9875\u5FC5\u586B\u7684\u4EBA\u5DE5\u4E8B\u9879", { tasks: manualTasks(before), side_effects: "none" });
      let resolvedTarget;
      try {
        resolvedTarget = await this.resolve(params.pageId, { ...target, field: target.label });
      } catch (error2) {
        if (params.intent !== "add_record" || !target.identity || !target.scope || errorCode(error2) !== "target_unresolved") throw error2;
        target = { label: target.label, scope: target.scope, ...target.frame !== void 0 ? { frame: target.frame } : {} };
        resolvedTarget = await this.resolve(params.pageId, { ...target, field: target.label, roles: ["button"] });
      }
      if (manualReason(resolvedTarget.meta)) throw new ControlFailure("manual_boundary", "activate_preflight");
      const targetScope = resolvedTarget.meta.scope;
      const inScope = (scope) => scope === targetScope || scope.startsWith(`${targetScope} / `);
      const oldRecords = new Set((before.records ?? []).filter((record2) => inScope(record2.scope)).map((record2) => `${record2.frame}:${record2.identity}`));
      if (params.intent === "focus") await this.focusResolved(params.pageId, { ...target, field: target.label }, markStarted);
      else {
        const roles = params.intent === "open" ? fieldControlRoles : ["button"];
        if (params.intent === "open") {
          const driver = new ControlDriver(this.getPage(params.pageId).pptrPage, { ...target, field: target.label }, params);
          try {
            const state = await driver.read();
            if (state.family !== "native" && state.family !== "phoenix-radio") await driver.openPopup();
            else await this.clickResolved(params.pageId, { ...target, field: target.label, roles }, true, markStarted);
          } finally {
            if (driver.tx.dispatched) markStarted();
            driver.close();
          }
        } else await this.clickResolved(params.pageId, { ...target, field: target.label, roles }, false, markStarted);
      }
      await this.delay(60);
      let after = await this.collect(params.pageId);
      const added = () => (after.records ?? []).filter((record2) => inScope(record2.scope) && !oldRecords.has(`${record2.frame}:${record2.identity}`));
      if (params.intent === "add_record") {
        const deadline = Date.now() + 1800;
        while (!added().length && Date.now() < deadline && before.url === after.url) {
          await this.delay(80);
          after = await this.collect(params.pageId);
        }
      }
      const changed = structuralHash(before) !== structuralHash(after) || !sameJson(before.validations, after.validations);
      const dayeeFamilyPair = params.intent === "add_record" && resolvedTarget.meta.plannerFamily === "dayee" && targetScope === "\u5BB6\u5EAD\u5173\u7CFB" && oldRecords.size === 0 && added().length === 2 && (after.records ?? []).filter((r) => inScope(r.scope)).length === 2 && added().every((r) => {
        const fields2 = after.fields.filter((f2) => f2.scope === r.scope && f2.frame === r.frame && f2.role !== "button");
        return fields2.some((f2) => f2.label === "\u59D3\u540D") && fields2.every((f2) => !f2.value && f2.checked !== true);
      });
      const accepted = params.intent === "add_record" ? dayeeFamilyPair || added().length === 1 && (after.records ?? []).filter((r) => inScope(r.scope)).length === oldRecords.size + 1 : params.intent === "focus" || changed || params.intent === "save_record";
      const generation = await this.advanceGeneration(params.pageId, beforeGeneration);
      const data = {
        ok: accepted,
        operation_id: params.operationId ?? randomUUID2(),
        generation,
        target: params.target,
        intent: params.intent,
        result: params.intent === "save_record" ? "action_dispatched" : accepted ? "completed" : "action_result_unknown",
        ...params.intent === "save_record" ? { status: "action_dispatched", persistence: "unknown", verification: { level: "action", matched: false } } : {},
        page_changed: before.url !== after.url,
        structure_changed: structuralHash(before) !== structuralHash(after),
        overlay: after.overlays.length ? "open" : "closed",
        validations: after.fields.filter((field) => field.error).map((field) => ({ field: field.label, scope: field.scope, error: field.error })),
        ...dayeeFamilyPair ? { record_creation: "dayee_initial_family_pair" } : {},
        ...params.intent === "add_record" ? { added_records: added().map((record2) => ({
          scope: record2.scope,
          fields: after.fields.filter((field) => field.scope === record2.scope).map((field) => ({ label: field.label, kind: fieldKind(field), state: fieldState(field), required: field.required }))
        })) } : {}
      };
      const result = contentResult(data, !accepted);
      this.recordOperation(params, "form_activate", params.target, accepted ? "completed" : "unknown", result);
      return result;
    } catch (error2) {
      const generation = actionStarted ? await this.advanceGeneration(params.pageId, beforeGeneration) : this.currentGeneration(params.pageId);
      const result = codedError(errorCode(error2), this.safeError(error2), { target: params.target, intent: params.intent, generation, status: actionStarted ? "partial" : "failed", side_effects: actionStarted ? "action_may_have_started" : "none" });
      this.recordOperation(params, "form_activate", params.target, "failed", result);
      return result;
    }
  }
  async collect(pageId) {
    const page = this.getPage(pageId);
    const frames = page.pptrPage.frames();
    let mainFrameFailed = false;
    let mainFrameError;
    const gathered = await Promise.all(frames.map(async (frame, frameIndex) => {
      try {
        if (frameIndex > 0 && typeof frame.frameElement === "function") {
          const host2 = await frame.frameElement();
          try {
            if (host2 && !await host2.evaluate((el) => {
              for (let node = el; node; node = node.parentElement) {
                const style = getComputedStyle(node);
                if (node.hidden || node.getAttribute("aria-hidden") === "true" || style.display === "none" || style.visibility === "hidden") return false;
              }
              const rect = el.getBoundingClientRect();
              const calendar = el instanceof HTMLIFrameElement && /\/My97DatePicker\/My97DatePicker\.htm(?:[?#]|$)/i.test(el.src);
              return rect.width > 0 && rect.height > 0 && (!calendar || rect.bottom > 0 && rect.right > 0);
            })) return { fields: [], overlays: [], sections: [], validations: [] };
          } finally {
            await host2?.dispose();
          }
        }
        const part = await this.withTimeout(
          frame.evaluate(collectDomForm),
          OBSERVE_FRAME_TIMEOUT,
          `observe_timeout: phase=frame_semantic_scan frame=${frameIndex}`
        );
        return {
          ...part,
          fields: part.fields.map((field) => ({ ...field, frame: frameIndex })),
          overlays: part.overlays.map((overlay) => ({ ...overlay, frame: frameIndex }))
        };
      } catch (error2) {
        if (frameIndex === 0) {
          mainFrameFailed = true;
          mainFrameError = error2;
        }
        return { fields: [], overlays: [], sections: [], validations: [] };
      }
    }));
    if (mainFrameFailed) {
      if (!/observe_timeout|timed out|context.*destroyed|cannot find context|detached.*frame|navigat/i.test(this.safeError(mainFrameError))) throw mainFrameError;
      await this.delay(150);
      try {
        const main = page.pptrPage.frames()[0];
        if (!main) throw new Error("main frame unavailable");
        const retry = await this.withTimeout(
          main.evaluate(collectDomForm),
          OBSERVE_FRAME_TIMEOUT,
          "observe_timeout: phase=frame_semantic_scan frame=0 retry=1 recovery=retry_observation"
        );
        gathered[0] = {
          ...retry,
          fields: retry.fields.map((field) => ({ ...field, frame: 0 })),
          overlays: retry.overlays.map((overlay) => ({ ...overlay, frame: 0 }))
        };
      } catch (error2) {
        throw error2;
      }
    }
    return {
      url: cleanText(page.pptrPage.url()),
      ...gathered.some((part) => "authenticationRequired" in part && part.authenticationRequired) ? { authenticationRequired: true } : {},
      ...gathered[0]?.documentId ? { documentId: gathered[0].documentId } : {},
      ..."workflow" in (gathered[0] ?? {}) && gathered[0]?.workflow ? { workflow: gathered[0].workflow } : {},
      title: cleanText(await this.withTimeout(page.pptrPage.title(), OBSERVE_FRAME_TIMEOUT, "observe_timeout: phase=page_metadata recovery=reload_page")),
      fields: gathered.flatMap((part) => part.fields),
      attachments: gathered.flatMap((part, frame) => ("attachments" in part ? part.attachments ?? [] : []).map((attachment) => ({ ...attachment, frame }))),
      overlays: gathered.flatMap((part) => part.overlays),
      sections: [...new Set(gathered.flatMap((part) => part.sections))],
      validations: [...new Set(gathered.flatMap((part) => part.validations))],
      records: gathered.flatMap((part, frame) => ("records" in part ? part.records ?? [] : []).map((record2) => ({ ...record2, frame })))
    };
  }
  updateState(pageId, raw) {
    const nav = navigationId(raw.url, raw.documentId);
    const currentHash = structuralHash(raw);
    const existing = this.states.get(pageId);
    if (!existing || existing.navigationId !== nav) {
      const created = { navigationId: nav, url: raw.url, generation: existing ? existing.generation + 1 : 1, lastStructuralHash: currentHash, snapshots: /* @__PURE__ */ new Map(), refToTarget: /* @__PURE__ */ new Map() };
      this.states.set(pageId, created);
      return created;
    }
    if (existing.lastStructuralHash !== currentHash) existing.generation += 1;
    existing.lastStructuralHash = currentHash;
    existing.url = raw.url;
    return existing;
  }
  fitBudget(snapshot, maxBytes) {
    const byteLength = () => {
      if (snapshot.records) {
        const scopes = new Set(snapshot.fields.map((f2) => f2.scope ?? ""));
        snapshot.records = snapshot.records.filter((record2) => scopes.has(record2.scope));
      }
      return Buffer.byteLength(JSON.stringify(snapshot), "utf8");
    };
    const original = {
      fields: snapshot.fields.length,
      options: snapshot.fields.reduce((sum, field) => sum + (field.options?.length ?? 0), 0) + snapshot.overlays.reduce((sum, overlay) => sum + overlay.options.length, 0),
      sections: snapshot.sections.length,
      validations: snapshot.validations.length
    };
    while (byteLength() > maxBytes && snapshot.overlays.some((overlay) => overlay.options.length > 8)) {
      const largest = snapshot.overlays.slice().sort((a, b) => b.options.length - a.options.length)[0];
      if (!largest) break;
      largest.options.pop();
    }
    while (byteLength() > maxBytes && snapshot.fields.some((field) => (field.options?.length ?? 0) > 8)) {
      const largest = snapshot.fields.slice().sort((a, b) => (b.options?.length ?? 0) - (a.options?.length ?? 0))[0];
      largest?.options?.pop();
    }
    while (byteLength() > maxBytes && snapshot.fields.length > 1) snapshot.fields.pop();
    while (byteLength() > maxBytes && snapshot.sections.length > 0) snapshot.sections.pop();
    while (byteLength() > maxBytes && snapshot.validations.length > 1) snapshot.validations.pop();
    const currentOptions = snapshot.fields.reduce((sum, field) => sum + (field.options?.length ?? 0), 0) + snapshot.overlays.reduce((sum, overlay) => sum + overlay.options.length, 0);
    snapshot.omitted_counts = {
      fields: original.fields - snapshot.fields.length,
      options: original.options - currentOptions,
      sections: original.sections - snapshot.sections.length,
      validations: original.validations - snapshot.validations.length
    };
    snapshot.truncated = Object.values(snapshot.omitted_counts).some((value) => value > 0);
    if (snapshot.truncated) snapshot.next_observation = { mode: snapshot.target ? "focus" : "full", ...snapshot.target ? { target: snapshot.target } : {}, ...snapshot.scope ? { scope: snapshot.scope } : {} };
  }
  expandTarget(pageId, field, scope) {
    const mapped = this.states.get(pageId)?.refToTarget.get(field);
    return mapped ? { ...mapped, ...scope && scope !== "page" ? { scope } : {} } : { label: field, ...scope ? { scope } : {} };
  }
  checkGeneration(pageId, expected) {
    if (expected === void 0) return null;
    const current = this.states.get(pageId)?.generation;
    return current !== void 0 && current !== expected ? codedError("generation_conflict", "\u9875\u9762\u7ED3\u6784\u5DF2\u7ECF\u53D8\u5316\uFF0C\u8BF7\u5148\u6267\u884C focus \u6216 delta \u89C2\u5BDF", { expected_generation: expected, current_generation: current }) : null;
  }
  async prepareAction(context) {
    this.activeSignal = context.signal;
    this.actionStartedAt = Date.now();
    try {
      context.signal?.throwIfAborted();
      const raw = await this.collect(context.pageId);
      this.updateState(context.pageId, raw);
      if (raw.authenticationRequired) return codedError("authentication_required", "\u62DB\u8058\u9875\u9762\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u7528\u6237\u5728\u4E13\u7528\u6D4F\u89C8\u5668\u91CD\u65B0\u767B\u5F55", { side_effects: "none" });
      this.requireSupported(raw);
    } catch (error2) {
      if (error2 instanceof UnsupportedFormError) return codedError(error2.code, "\u5F53\u524D\u4F01\u4E1A\u6A21\u677F\u6216\u9875\u9762\u7ED3\u6784\u5C1A\u672A\u901A\u8FC7\u586B\u5199\u68C0\u67E5", { support: error2.support, side_effects: "none" });
      return codedError("operation_timeout", this.safeError(error2), {
        phase: "action_preflight_observation",
        recovery: "retry_once_then_reload_page",
        page_id: context.pageId
      });
    }
    return this.checkGeneration(context.pageId, context.expectedGeneration);
  }
  currentGeneration(pageId) {
    return this.states.get(pageId)?.generation ?? 1;
  }
  async advanceGeneration(pageId, beforeGeneration) {
    try {
      const raw = await this.collect(pageId);
      const state = this.updateState(pageId, raw);
      if (state.generation <= beforeGeneration) state.generation = beforeGeneration + 1;
      return state.generation;
    } catch {
      const state = this.states.get(pageId);
      if (!state) return beforeGeneration + 1;
      state.generation = Math.max(state.generation, beforeGeneration + 1);
      return state.generation;
    }
  }
  recordLowLevelOperation(pageId, action, operationId, target, resultName, scope, elapsedMs) {
    this.appendLedger(pageId, {
      operation_id: operationId ?? randomUUID2(),
      action,
      target,
      result: resultName,
      tracking: "low_level_unverified",
      ...scope ? { scope } : {},
      ...elapsedMs !== void 0 ? { elapsed_ms: elapsedMs } : {},
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  async resolve(pageId, spec) {
    this.activeSignal?.throwIfAborted();
    const page = this.getPage(pageId);
    const frames = page.pptrPage.frames();
    const candidates = [];
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
      const frame = frames[frameIndex];
      if (!frame || spec.frame !== void 0 && spec.frame !== frameIndex) continue;
      try {
        const found = await frame.evaluate(findSemanticCandidates, spec);
        for (const item of found) candidates.push({ frame, meta: { ...item, frame: frameIndex } });
      } catch {
      }
    }
    candidates.sort((left, right) => right.meta.score - left.meta.score);
    const best = candidates[0];
    if (!best) throw new Error(`target_unresolved: no candidate for ${spec.option ?? spec.field}`);
    const runnerUp = candidates[1];
    if (runnerUp && runnerUp.meta.score === best.meta.score) {
      throw new Error(`target_ambiguous: ${spec.option ?? spec.field} matched ${candidates.filter((candidate) => candidate.meta.score === best.meta.score).length} controls`);
    }
    return best;
  }
  async elementHandle(resolved, spec) {
    const handle = await resolved.frame.evaluateHandle(resolveSemanticElement, spec);
    const element = handle.asElement();
    if (!element) {
      handle[Symbol.dispose]?.();
      throw new Error("target_unresolved: semantic element changed before action");
    }
    return element;
  }
  async fillResolved(pageId, spec, value) {
    const initial = await this.resolve(pageId, spec);
    if (manualReason(initial.meta)) throw new ControlFailure("manual_boundary", "fill_preflight");
    if (typeof value !== "boolean" && (initial.meta.tag === "textarea" || initial.meta.tag === "input" && ["text", "search", "email", "tel", "url", "password", "number"].includes(initial.meta.type))) {
      const deadline = Date.now() + 800;
      let moving = false;
      do {
        this.activeSignal?.throwIfAborted();
        const resolved = await this.resolve(pageId, spec);
        if (manualReason(resolved.meta)) throw new ControlFailure("manual_boundary", "fill_preflight");
        const handle = await this.elementHandle(resolved, spec);
        let dispatched = false;
        try {
          await handle.focus();
          if (moving) await this.delay(35);
          const selected = await handle.evaluate((el) => {
            if (!el.isConnected || el !== document.activeElement) return "moving";
            if (el.disabled || el.readOnly) return "unsupported";
            el.select();
            return el.value === "" || el.selectionStart === 0 && el.selectionEnd === el.value.length || el.ownerDocument.getSelection()?.toString() === el.value ? "selected" : "unsupported";
          });
          if (selected === "moving") {
            moving = true;
            continue;
          }
          if (selected !== "selected") throw new ControlFailure("selection_not_confirmed", "fill_replace");
          this.activeSignal?.throwIfAborted();
          if (!await handle.evaluate((el) => el.isConnected && el === document.activeElement)) {
            moving = true;
            continue;
          }
          const keyboard = this.getPage(pageId).pptrPage.keyboard;
          dispatched = true;
          if (String(value)) await keyboard.sendCharacter(String(value));
          else await keyboard.press("Backspace");
          this.activeSignal?.throwIfAborted();
          return;
        } catch (error2) {
          this.activeSignal?.throwIfAborted();
          if (dispatched || error2 instanceof ControlFailure || !/detach|not connected|not an Element/i.test(String(error2))) throw error2;
          moving = true;
        } finally {
          await handle.dispose();
        }
      } while (Date.now() < deadline);
      throw new ControlFailure("target_unstable", "fill_prepare");
    }
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      this.activeSignal?.throwIfAborted();
      const resolved = await this.resolve(pageId, spec);
      const handle = await this.elementHandle(resolved, spec);
      try {
        let locator = handle.asLocator();
        if (typeof locator.setTimeout === "function") locator = locator.setTimeout(ACTION_TIMEOUT);
        if (typeof locator.setWaitForStableBoundingBox === "function") locator = locator.setWaitForStableBoundingBox(false);
        await fencedLocatorAction(locator, this.activeSignal, (runner, options) => runner.fill(typeof value === "number" ? String(value) : value, options), () => {
        }, [handle]);
        return;
      } catch (error2) {
        lastError = error2;
      } finally {
        handle[Symbol.dispose]?.();
      }
      await this.delay(15);
    }
    this.activeSignal?.throwIfAborted();
    const page = this.getPage(pageId);
    const frames = page.pptrPage.frames();
    for (const frame of frames) {
      try {
        const result = await frame.evaluate(atomicSetValue, spec, value);
        if (result.applied) return;
      } catch {
      }
    }
    throw new Error(`postcondition_failed: unable to fill semantic target (${this.safeError(lastError)})`);
  }
  async settleInput(pageId, spec) {
    const resolved = await this.resolve(pageId, spec);
    const handle = await this.elementHandle(resolved, spec);
    try {
      this.activeSignal?.throwIfAborted();
      await handle.evaluate((el) => el.blur());
      await resolved.frame.evaluate(() => new Promise((resolve5) => {
        const timer = setTimeout(resolve5, 180);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          clearTimeout(timer);
          resolve5();
        }));
      }));
      this.activeSignal?.throwIfAborted();
    } finally {
      await handle.dispose();
    }
  }
  async clickResolved(pageId, spec, allowAtomicFallback, onActionStarted) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      this.activeSignal?.throwIfAborted();
      const resolved = await this.resolve(pageId, spec);
      const handle = await this.elementHandle(resolved, spec);
      let started = false;
      let locator;
      const listener2 = () => {
        this.activeSignal?.throwIfAborted();
        started = true;
        onActionStarted?.();
      };
      try {
        await handle.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
        let previousBox = "";
        let ready = false;
        for (let sample = 0; sample < 12; sample++) {
          this.activeSignal?.throwIfAborted();
          const hit = await handle.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return { box: [r.x, r.y, r.width, r.height].join(","), hit: r.width > 0 && r.height > 0 && Boolean(top && (top === el || el.contains(top))) };
          });
          if (hit.hit && hit.box === previousBox) {
            ready = true;
            break;
          }
          previousBox = hit.box;
          await this.delay(50);
        }
        if (!ready) throw new ControlFailure("target_obscured", "activate_hit_test");
        const enabled = await handle.evaluate((el) => el.isConnected && !el.matches(':disabled,[aria-disabled="true"]') && !el.closest("[inert]"));
        if (!enabled) throw new ControlFailure("constraint_violation", "activate_disabled");
        const point = await handle.clickablePoint();
        this.activeSignal?.throwIfAborted();
        listener2();
        await this.getPage(pageId).pptrPage.mouse.click(point.x, point.y);
        return;
      } catch (error2) {
        lastError = error2;
        if (error2 instanceof ControlFailure && error2.code === "target_obscured") throw error2;
        if (started) throw new Error("action_result_unknown: click started before the node changed", { cause: error2 });
      } finally {
        locator?.off?.("action", listener2);
        handle[Symbol.dispose]?.();
      }
      await this.delay(15);
    }
    this.activeSignal?.throwIfAborted();
    if (allowAtomicFallback) {
      const page = this.getPage(pageId);
      for (const frame of page.pptrPage.frames()) {
        try {
          const result = await frame.evaluate(atomicClick, spec);
          if (result.applied) {
            onActionStarted?.();
            return;
          }
        } catch {
        }
      }
    }
    throw new Error(`postcondition_failed: unable to activate semantic target (${this.safeError(lastError)})`);
  }
  async focusResolved(pageId, spec, onActionStarted) {
    const resolved = await this.resolve(pageId, spec);
    const handle = await this.elementHandle(resolved, spec);
    try {
      onActionStarted?.();
      await handle.evaluate((element) => element.focus({ preventScroll: false }));
    } finally {
      handle[Symbol.dispose]?.();
    }
  }
  async waitResolve(pageId, spec) {
    let lastError;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        return await this.resolve(pageId, spec);
      } catch (error2) {
        lastError = error2;
        await this.delay(50);
      }
    }
    throw lastError ?? new Error(`option_not_found: ${spec.option ?? spec.field}`);
  }
  async keyboardConfirmActiveOption(pageId, value) {
    const page = this.getPage(pageId);
    const wanted = normalize(value);
    for (const frame of page.pptrPage.frames()) {
      try {
        const active = await frame.evaluate((expected) => {
          const norm = (item) => String(item ?? "").replace(/[\s*：:]+/g, "").trim().toLowerCase();
          const focused2 = document.activeElement;
          const activeId = focused2?.getAttribute("aria-activedescendant");
          const byId = activeId ? document.getElementById(activeId) : null;
          const highlighted = byId ?? document.querySelector('[role="option"][aria-selected="true"], .ant-select-item-option-active, .el-select-dropdown__item.hover, .el-cascader-node.in-active-path');
          return Boolean(highlighted && norm(highlighted.innerText || highlighted.textContent) === expected);
        }, wanted);
        if (!active) continue;
        this.activeSignal?.throwIfAborted();
        await page.pptrPage.keyboard.press("Enter");
        await this.delay(30);
        return true;
      } catch {
      }
    }
    return false;
  }
  valueMatches(candidate, wanted) {
    if (candidate.checked !== null) return typeof wanted === "boolean" && candidate.checked === wanted;
    return sameValue(candidate.value, String(wanted));
  }
  hasExistingValue(candidate) {
    if (candidate.checked !== null) return false;
    const value = normalize(candidate.value);
    if (!value) return false;
    return !/^(请选择.*|选择.*|未选择.*|尚未选择.*|打开.*|pleasechoose.*|select)$/.test(value);
  }
  constraintError(candidate, value) {
    if (candidate.disabled) return "target is disabled";
    if (candidate.checked !== null && typeof value !== "boolean") return "checkbox/radio value must be boolean";
    if (typeof value === "boolean") return null;
    const text3 = String(value);
    if (candidate.readonly) return "target is readonly";
    if (candidate.constraints.maxlength !== null && text3.length > candidate.constraints.maxlength) return `value exceeds maxlength ${candidate.constraints.maxlength}`;
    if (candidate.constraints.minlength !== null && text3.length < candidate.constraints.minlength) return `value is shorter than minlength ${candidate.constraints.minlength}`;
    if (candidate.constraints.pattern) {
      try {
        if (!new RegExp(`^(?:${candidate.constraints.pattern})$`).test(text3)) return `value does not match pattern ${candidate.constraints.pattern}`;
      } catch {
      }
    }
    if (candidate.constraints.min && text3 < candidate.constraints.min) return `value is below min ${candidate.constraints.min}`;
    if (candidate.constraints.max && text3 > candidate.constraints.max) return `value is above max ${candidate.constraints.max}`;
    return null;
  }
  async verifySelected(pageId, target, value) {
    try {
      const field = await this.resolve(pageId, { ...target, field: target.label, roles: fieldControlRoles });
      if (field.meta.checked !== null) return field.meta.checked;
      return sameValue(field.meta.value, value);
    } catch {
      return false;
    }
  }
  async hasTargetOverlay(pageId, spec) {
    const frames = this.getPage(pageId).pptrPage.frames();
    for (const [index, frame] of frames.entries()) {
      if (spec.frame !== void 0 && spec.frame !== index) continue;
      try {
        if (await frame.evaluate(hasDomOverlay, spec)) return true;
      } catch {
      }
    }
    return false;
  }
  async overlayState(pageId) {
    try {
      return (await this.collect(pageId)).overlays.length ? "open" : "closed";
    } catch {
      return "unknown";
    }
  }
  safeCandidateState(candidate) {
    return {
      label: candidate.label,
      scope: candidate.scope,
      value_state: candidate.value ? "filled" : candidate.checked ? "selected" : "blank",
      disabled: candidate.disabled,
      readonly: candidate.readonly
    };
  }
  summarize(results) {
    const summary = {};
    for (const result of results) {
      const key2 = String(result.status ?? "unknown");
      summary[key2] = (summary[key2] ?? 0) + 1;
    }
    return summary;
  }
  operationFingerprint(params, action) {
    const { signal: _signal, expectedGeneration: _generation, operationId: _id, testMode: _test, timeoutMs: _timeout, ...request } = params;
    return createHash2("sha256").update(JSON.stringify({ action, request })).digest("hex");
  }
  operationResult(params, action) {
    const cached2 = params.operationId ? this.completedOperations.get(params.operationId) : void 0;
    if (!cached2) return params.operationId && this.expiredOperations.has(shortHash(params.operationId)) ? codedError("operation_expired", "Observe before retrying with a new operation ID") : null;
    if (cached2.fingerprint !== this.operationFingerprint(params, action) || cached2.navigation !== this.states.get(params.pageId)?.navigationId) {
      return codedError("operation_id_conflict", "This operation ID belongs to a different request or document");
    }
    return cached2.result;
  }
  recordOperation(context, action, target, resultName, result) {
    if (context.operationId) {
      this.completedOperations.set(context.operationId, { fingerprint: this.operationFingerprint(context, action), navigation: this.states.get(context.pageId)?.navigationId ?? "", result });
      if (this.completedOperations.size > 256) {
        const oldest = this.completedOperations.keys().next().value;
        this.expiredOperations.add(shortHash(oldest));
        this.completedOperations.delete(oldest);
      }
    }
    if (!context.testMode) return;
    this.appendLedger(context.pageId, {
      operation_id: context.operationId ?? randomUUID2(),
      action,
      target,
      result: resultName,
      tracking: "semantic",
      ...context.scope ? { scope: context.scope } : {},
      ...context.fields ? { targets: context.fields.map((f2) => `${f2.scope ?? ""} / ${f2.field}`) } : {},
      elapsed_ms: result.structuredContent?.elapsed_ms ?? Math.max(0, Date.now() - this.actionStartedAt),
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  safeError(error2) {
    const message = error2 instanceof Error ? error2.message : String(error2);
    return message.replace(/(cookie|authorization|set-cookie)\s*[:=]\s*[^\s,;]+/gi, "$1=<redacted>").slice(0, 400);
  }
  delay(milliseconds) {
    return new Promise((resolve5) => setTimeout(resolve5, milliseconds));
  }
  async withTimeout(promise, milliseconds, message) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(message)), milliseconds);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
};

// src/profile-store.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import { chmod as chmod2, copyFile, mkdir as mkdir3, open as open2, readFile as readFile2, readdir, rename, stat, writeFile } from "node:fs/promises";
import { homedir as homedir3 } from "node:os";
import { dirname as dirname2, isAbsolute as isAbsolute2, join as join4, resolve as resolve2 } from "node:path";

// src/profile-fields.ts
var text = external_exports.string().max(6e3).nullable();
var date = external_exports.string().regex(/^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/).refine((value) => {
  const [y, m, d] = value.split("-").map(Number);
  return !!y && (!d || d <= new Date(Date.UTC(y, m, 0)).getUTCDate());
}, "\u65E0\u6548\u65E5\u671F").nullable();
var month = external_exports.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable();
var optional = (schema) => schema.default(null);
var presenceKeys = ["education", "work", "internships", "projects", "languages", "awards", "certificates", "competitions", "campus"];
var presenceShape = Object.fromEntries(presenceKeys.map((key2) => [key2, external_exports.enum(["unknown", "none", "provided"]).default("unknown")]));
var presenceSchema = external_exports.object(presenceShape).strict();
var basicExtras = { gender: optional(text), birth_date: date.default(null), employment_status: optional(text), highest_education: optional(text), recent_company: optional(text), self_description: optional(text), portfolio_url: optional(text) };
var educationExtras = { college: optional(text), description: optional(text), gpa: optional(text) };
var experienceExtras = { description: optional(text) };
var projectExtras = { description: optional(text), responsibilities: optional(text), url: optional(text) };
var certificateExtras = { description: optional(text) };
var salary = external_exports.object({ amount: external_exports.number().nonnegative(), currency: external_exports.string().max(16), period: external_exports.enum(["month", "year"]), tax: external_exports.enum(["before", "after", "unknown"]), benefits: external_exports.enum(["included", "excluded", "unknown"]) }).strict().nullable();
var intentSchema = external_exports.object({ cities: external_exports.array(external_exports.string().max(160)).max(20).default([]), current_salary: salary.default(null), expected_salary: salary.default(null), available_date: date.default(null), industry: optional(text), occupation: optional(text) }).strict();
var languageShape = { name: text, overall: optional(text), speaking: optional(text), writing: optional(text) };
var awardShape = { name: text, obtained_month: month, description: optional(text) };
var campusShape = { organization: text, role: text, start_month: month, end_month: month, is_current: external_exports.boolean().nullable(), description: optional(text) };
var competitionShape = { name: text, description: optional(text), obtained_month: month.default(null) };

// src/profile-store.ts
var ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
var id = external_exports.string().regex(ID_PATTERN);
var optionalId = id.optional();
var text2 = external_exports.string().max(6e3);
var nullableText = text2.nullable();
var month2 = external_exports.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable();
var factInput = external_exports.object({ id: optionalId, text: text2 }).strict();
var fact = external_exports.object({ id, text: text2 }).strict();
var educationShape = {
  ...educationExtras,
  school: nullableText,
  major: nullableText,
  education_level: external_exports.enum(["high_school", "associate", "bachelor", "master", "doctor", "other"]).nullable(),
  degree: nullableText,
  expected_degree: nullableText,
  completed: external_exports.boolean().nullable(),
  study_mode: external_exports.enum(["full_time", "part_time", "other"]).nullable(),
  start_month: month2,
  end_month: month2,
  is_current: external_exports.boolean().nullable(),
  is_expected_end: external_exports.boolean().nullable()
};
var experienceShape = {
  ...experienceExtras,
  kind: external_exports.enum(["internship", "work"]).nullable(),
  organization: nullableText,
  role: nullableText,
  start_month: month2,
  end_month: month2,
  is_current: external_exports.boolean().nullable()
};
var projectShape = {
  ...projectExtras,
  name: nullableText,
  role: nullableText,
  start_month: month2,
  end_month: month2,
  is_current: external_exports.boolean().nullable()
};
var certificateShape = { ...certificateExtras, name: nullableText, issuer: nullableText, obtained_month: month2 };
var answerShape = { title: external_exports.string().max(120), text: text2 };
var supplementalShape = {
  field_key: external_exports.string().max(160),
  label: external_exports.string().max(80),
  description: external_exports.string().max(300),
  value_type: external_exports.enum(["text", "multiline"]),
  value: nullableText
};
var educationInput = external_exports.object({ id: optionalId, ...educationShape }).strict();
var education2 = external_exports.object({ id, ...educationShape }).strict();
var experienceInput = external_exports.object({ id: optionalId, ...experienceShape, facts: external_exports.array(factInput).max(50) }).strict();
var experience2 = external_exports.object({ id, ...experienceShape, facts: external_exports.array(fact).max(50) }).strict();
var projectInput = external_exports.object({ id: optionalId, ...projectShape, technologies: external_exports.array(external_exports.string().max(120)).max(100), facts: external_exports.array(factInput).max(50) }).strict();
var project2 = external_exports.object({ id, ...projectShape, technologies: external_exports.array(external_exports.string().max(120)).max(100), facts: external_exports.array(fact).max(50) }).strict();
var certificateInput = external_exports.object({ id: optionalId, ...certificateShape }).strict();
var certificate = external_exports.object({ id, ...certificateShape }).strict();
var answerInput = external_exports.object({ id: optionalId, ...answerShape }).strict();
var answer = external_exports.object({ id, ...answerShape }).strict();
var supplementalInput = external_exports.object({ id: optionalId, ...supplementalShape }).strict();
var supplemental = external_exports.object({ id, ...supplementalShape }).strict();
var basic2 = external_exports.object({
  ...basicExtras,
  full_name: nullableText,
  email: external_exports.string().max(254).email().nullable(),
  phone: external_exports.string().max(80).nullable(),
  city: nullableText,
  job_intention: nullableText
}).strict();
var extraShapes = { languages: languageShape, awards: awardShape, campus: campusShape, competitions: competitionShape };
var extraSchemas = Object.fromEntries(Object.entries(extraShapes).map(([k, v]) => [k, external_exports.array(external_exports.object({ id, ...v }).strict()).max(50).default([])]));
var extraInputs = Object.fromEntries(Object.entries(extraShapes).map(([k, v]) => [k, external_exports.array(external_exports.object({ id: optionalId, ...v }).strict()).max(50).optional()]));
var ProfileSchema = external_exports.object({
  schema_version: external_exports.enum(["1.1", "1.2"]).transform(() => "1.2"),
  languages: extraSchemas.languages,
  awards: extraSchemas.awards,
  campus: extraSchemas.campus,
  competitions: extraSchemas.competitions,
  section_status: presenceSchema.default({}),
  intent: intentSchema.default({}),
  profile_id: id,
  revision: external_exports.number().int().nonnegative(),
  basic: basic2,
  education: external_exports.array(education2).max(30),
  experience: external_exports.array(experience2).max(50),
  projects: external_exports.array(project2).max(50),
  skills: external_exports.array(external_exports.string().max(120)).max(100),
  certificates: external_exports.array(certificate).max(50),
  custom_answers: external_exports.array(answer).max(50),
  supplemental_fields: external_exports.array(supplemental).max(500)
}).strict().superRefine((profile, context) => {
  const ids = /* @__PURE__ */ new Set([profile.profile_id]);
  const fieldKeys = /* @__PURE__ */ new Set();
  const collections = Object.entries({
    languages: profile.languages,
    awards: profile.awards,
    campus: profile.campus,
    competitions: profile.competitions,
    education: profile.education,
    experience: profile.experience,
    projects: profile.projects,
    certificates: profile.certificates,
    custom_answers: profile.custom_answers,
    supplemental_fields: profile.supplemental_fields
  });
  for (const [section, records] of collections) {
    records.forEach((record2, index) => {
      const recordIds = [record2.id, ...record2.facts?.map((item) => item.id) ?? []];
      for (const value of recordIds) {
        if (ids.has(value)) context.addIssue({ code: external_exports.ZodIssueCode.custom, path: [section, index, "id"], message: "\u6761\u76EE\u548C\u4E8B\u5B9E ID \u4E0D\u80FD\u91CD\u590D" });
        ids.add(value);
      }
      if (record2.start_month && record2.end_month && record2.start_month > record2.end_month) {
        context.addIssue({ code: external_exports.ZodIssueCode.custom, path: [section, index, "end_month"], message: "\u7ED3\u675F\u65F6\u95F4\u4E0D\u80FD\u65E9\u4E8E\u5F00\u59CB\u65F6\u95F4" });
      }
    });
  }
  for (const key2 of presenceKeys) {
    const rows = key2 === "work" || key2 === "internships" ? profile.experience.filter((r) => r.kind === (key2 === "work" ? "work" : "internship")) : profile[key2];
    if (profile.section_status[key2] === "none" && rows.length) context.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["section_status", key2], message: "\u660E\u786E\u6CA1\u6709\u4E0E\u5DF2\u6709\u8BB0\u5F55\u51B2\u7A81" });
    if (profile.section_status[key2] === "provided" && !rows.length) context.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["section_status", key2], message: "\u5DF2\u63D0\u4F9B\u680F\u76EE\u9700\u8981\u81F3\u5C11\u4E00\u6761\u8BB0\u5F55" });
  }
  profile.supplemental_fields.forEach((field, index) => {
    if (!field.field_key.trim() || !field.label.trim() || fieldKeys.has(field.field_key)) {
      context.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["supplemental_fields", index], message: "\u8865\u5145\u8D44\u6599\u9700\u8981\u540D\u79F0\u548C\u552F\u4E00\u5B57\u6BB5\u6807\u8BC6" });
    }
    fieldKeys.add(field.field_key);
  });
});
var ProfileChangesSchema = external_exports.object({
  languages: extraInputs.languages,
  awards: extraInputs.awards,
  campus: extraInputs.campus,
  competitions: extraInputs.competitions,
  section_status: presenceSchema.partial().optional(),
  intent: intentSchema.partial().optional(),
  basic: basic2.partial().optional(),
  education: external_exports.array(educationInput).max(30).optional(),
  experience: external_exports.array(experienceInput).max(50).optional(),
  projects: external_exports.array(projectInput).max(50).optional(),
  skills: external_exports.array(external_exports.string().max(120)).max(100).optional(),
  certificates: external_exports.array(certificateInput).max(50).optional(),
  custom_answers: external_exports.array(answerInput).max(50).optional(),
  supplemental_fields: external_exports.array(supplementalInput).max(500).optional()
}).strict();
var ProfileSaveSchema = external_exports.object({
  profile_id: id.optional().describe("\u66F4\u65B0\u65F6\u586B\u5199 resume_profile_list \u8FD4\u56DE\u7684 ID\uFF1B\u521B\u5EFA\u65F6\u7701\u7565"),
  expected_revision: external_exports.number().int().nonnegative().optional().describe("\u66F4\u65B0\u65F6\u5FC5\u586B\uFF0C\u5FC5\u987B\u7B49\u4E8E\u6700\u8FD1\u8BFB\u53D6\u5230\u7684\u4FEE\u8BA2\u53F7"),
  name: external_exports.string().trim().min(1).max(80).optional(),
  changes: ProfileChangesSchema,
  source_markdown: external_exports.string().max(262144).nullable().optional()
}).strict().superRefine((input, context) => {
  if (input.profile_id && input.expected_revision === void 0) context.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["expected_revision"], message: "\u66F4\u65B0\u8D44\u6599\u5FC5\u987B\u63D0\u4F9B expected_revision" });
  if (!input.profile_id && input.expected_revision !== void 0) context.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["expected_revision"], message: "\u521B\u5EFA\u8D44\u6599\u65F6\u4E0D\u80FD\u63D0\u4F9B expected_revision" });
  if (!input.profile_id && !input.name) context.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["name"], message: "\u521B\u5EFA\u8D44\u6599\u5FC5\u987B\u63D0\u4F9B\u540D\u79F0" });
  if (input.profile_id && input.name === void 0 && input.source_markdown === void 0 && Object.keys(input.changes).length === 0) context.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["changes"], message: "\u6CA1\u6709\u8981\u4FDD\u5B58\u7684\u66F4\u6539" });
});
var StoredProfileSchema = external_exports.object({
  format: external_exports.literal("resume-companion-profile"),
  storage_version: external_exports.literal(1),
  id,
  name: external_exports.string().trim().min(1).max(80),
  revision: external_exports.number().int().positive(),
  created_at: external_exports.string().datetime(),
  updated_at: external_exports.string().datetime(),
  source_markdown: external_exports.string().max(262144).nullable(),
  profile: ProfileSchema
}).strict();
var IndexEntrySchema = external_exports.object({
  id,
  name: external_exports.string().trim().min(1).max(80),
  revision: external_exports.number().int().positive(),
  created_at: external_exports.string().datetime(),
  updated_at: external_exports.string().datetime(),
  has_source_markdown: external_exports.boolean()
}).strict();
var IndexSchema = external_exports.object({
  format: external_exports.literal("resume-companion-index"),
  storage_version: external_exports.literal(1),
  profiles: external_exports.array(IndexEntrySchema).max(100)
}).strict();
var emptyProfile = (profileId, revision) => ProfileSchema.parse({
  schema_version: "1.2",
  profile_id: profileId,
  revision,
  basic: { full_name: null, email: null, phone: null, city: null, job_intention: null },
  education: [],
  experience: [],
  projects: [],
  skills: [],
  certificates: [],
  custom_answers: [],
  supplemental_fields: []
});
var ensureId = (value) => value ?? randomUUID3();
function mergeChanges(profile, changes, revision) {
  const next = structuredClone(profile);
  next.schema_version = "1.2";
  if (changes.section_status) next.section_status = presenceSchema.parse({ ...next.section_status, ...changes.section_status });
  if (changes.intent) next.intent = intentSchema.parse({ ...next.intent, ...changes.intent });
  for (const key2 of ["languages", "awards", "campus", "competitions"]) {
    const rows = changes[key2];
    if (rows) next[key2] = extraSchemas[key2].parse(rows.map((row) => ({ ...row, id: ensureId(row.id) })));
  }
  if (changes.basic) next.basic = basic2.parse({ ...next.basic, ...changes.basic });
  if (changes.education) next.education = external_exports.array(education2).parse(changes.education.map((record2) => ({ ...record2, id: ensureId(record2.id) })));
  if (changes.experience) next.experience = external_exports.array(experience2).parse(changes.experience.map((record2) => ({ ...record2, id: ensureId(record2.id), facts: record2.facts.map((item) => ({ ...item, id: ensureId(item.id) })) })));
  if (changes.projects) next.projects = external_exports.array(project2).parse(changes.projects.map((record2) => ({ ...record2, id: ensureId(record2.id), facts: record2.facts.map((item) => ({ ...item, id: ensureId(item.id) })) })));
  if (changes.skills) next.skills = changes.skills;
  if (changes.certificates) next.certificates = external_exports.array(certificate).parse(changes.certificates.map((record2) => ({ ...record2, id: ensureId(record2.id) })));
  if (changes.custom_answers) next.custom_answers = external_exports.array(answer).parse(changes.custom_answers.map((record2) => ({ ...record2, id: ensureId(record2.id) })));
  if (changes.supplemental_fields) next.supplemental_fields = external_exports.array(supplemental).parse(changes.supplemental_fields.map((record2) => ({ ...record2, id: ensureId(record2.id) })));
  next.revision = revision;
  return ProfileSchema.parse(next);
}
function defaultDataDir() {
  if (process.platform === "darwin") return join4(homedir3(), "Library", "Application Support", "Resume Companion");
  if (process.platform === "win32") return join4(process.env.APPDATA || join4(homedir3(), "AppData", "Roaming"), "Resume Companion");
  return join4(process.env.XDG_DATA_HOME || join4(homedir3(), ".local", "share"), "resume-companion");
}
function resolveDataDir(value = process.env.RESUME_COMPANION_DATA_DIR) {
  if (!value) return defaultDataDir();
  const expanded = value === "~" ? homedir3() : value.startsWith("~/") ? join4(homedir3(), value.slice(2)) : value;
  return isAbsolute2(expanded) ? resolve2(expanded) : resolve2(process.cwd(), expanded);
}
async function syncDirectory(path) {
  try {
    const handle = await open2(path, "r");
    await handle.sync();
    await handle.close();
  } catch {
  }
}
async function atomicWrite(path, value) {
  await mkdir3(dirname2(path), { recursive: true, mode: 448 });
  const temporary = `${path}.tmp-${process.pid}-${randomUUID3()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}
`, { encoding: "utf8", mode: 384 });
  const handle = await open2(temporary, "r");
  await handle.sync();
  await handle.close();
  await rename(temporary, path);
  await chmod2(path, 384).catch(() => void 0);
  await syncDirectory(dirname2(path));
}
function storageError(code, message) {
  const error2 = new Error(`${code}: ${message}`);
  error2.code = code;
  return error2;
}
function fileErrorCode(error2) {
  return typeof error2 === "object" && error2 !== null && "code" in error2 && typeof error2.code === "string" ? error2.code : void 0;
}
function entryFor(stored) {
  return {
    id: stored.id,
    name: stored.name,
    revision: stored.revision,
    created_at: stored.created_at,
    updated_at: stored.updated_at,
    has_source_markdown: stored.source_markdown !== null
  };
}
var displayEnums = {
  high_school: "\u9AD8\u4E2D",
  associate: "\u5927\u4E13",
  bachelor: "\u672C\u79D1",
  master: "\u7855\u58EB\u7814\u7A76\u751F",
  doctor: "\u535A\u58EB\u7814\u7A76\u751F",
  full_time: "\u5168\u65E5\u5236",
  part_time: "\u975E\u5168\u65E5\u5236",
  other: "\u5176\u4ED6",
  internship: "\u5B9E\u4E60",
  work: "\u5DE5\u4F5C"
};
function scalarSource(profile, sourceRef) {
  if (sourceRef === "skills") return profile.skills.join("\u3001");
  const parts = sourceRef.split("/");
  const section = parts[0];
  const recordId = parts[1];
  const field = parts[2];
  if (section === "basic" && parts.length === 2 && recordId && Object.hasOwn(profile.basic, recordId)) {
    return profile.basic[recordId];
  }
  if ((section === "intent" || section === "section_status") && parts.length === 2 && recordId) {
    const value = profile[section][recordId];
    return Array.isArray(value) ? value.join("\u3001") : typeof value === "string" || typeof value === "boolean" || value === null ? value : void 0;
  }
  if (section === "custom_answers" && parts.length === 2) return profile.custom_answers.find((item) => item.id === recordId)?.text;
  if (section === "supplemental_fields" && parts.length === 2) return profile.supplemental_fields.find((item) => item.id === recordId)?.value;
  if (section && recordId && field && ["education", "experience", "projects", "certificates", "languages", "awards", "competitions", "campus"].includes(section) && parts.length === 3) {
    const collection = profile[section];
    const record2 = collection?.find((item) => item.id === recordId);
    if (!record2 || !Object.hasOwn(record2, field)) return void 0;
    const raw = record2[field];
    if (Array.isArray(raw)) return raw.map((item) => typeof item === "string" ? item : typeof item === "object" && item !== null && "text" in item ? String(item.text) : "").join(field === "facts" ? "\n" : "\u3001");
    if (typeof raw === "string") return displayEnums[raw] ?? raw;
    if (typeof raw === "boolean" || raw === null) return raw;
  }
  return void 0;
}
var ProfileReadSchema = external_exports.object({
  profile_id: id,
  expected_revision: external_exports.number().int().positive().optional().describe("\u9996\u6B21\u76EE\u5F55\u8BFB\u53D6\u540E\uFF0C\u540E\u7EED\u8BFB\u53D6\u586B\u5199\u8BE5\u6B21\u8FD4\u56DE\u7684 profile_revision"),
  section: external_exports.enum(["basic", "education", "experience", "projects", "skills", "certificates", "custom_answers", "supplemental_fields", "languages", "awards", "campus", "competitions", "intent", "section_status"]).optional(),
  record_id: id.optional(),
  source_refs: external_exports.array(external_exports.string().min(1).max(240)).max(100).optional(),
  offset: external_exports.number().int().nonnegative().optional(),
  limit: external_exports.number().int().min(1).max(50).optional(),
  include_source_markdown: external_exports.boolean().optional()
}).strict();
var ProfileStore = class {
  dataDir;
  indexPath;
  queue = Promise.resolve();
  constructor(dataDir = resolveDataDir()) {
    this.dataDir = dataDir;
    this.indexPath = join4(dataDir, "index.json");
  }
  async initialize() {
    for (const folder of ["", "profiles", "history", "backups"]) await mkdir3(join4(this.dataDir, folder), { recursive: true, mode: 448 });
    await chmod2(this.dataDir, 448).catch(() => void 0);
    try {
      await stat(this.indexPath);
    } catch (error2) {
      if (fileErrorCode(error2) !== "ENOENT") throw error2;
      await atomicWrite(this.indexPath, { format: "resume-companion-index", storage_version: 1, profiles: [] });
    }
    await this.readIndex();
    return this.status();
  }
  exclusive(job) {
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => void 0);
    return next;
  }
  async readIndex() {
    let raw;
    try {
      raw = await readFile2(this.indexPath, "utf8");
    } catch (error2) {
      throw storageError("storage_unavailable", `\u65E0\u6CD5\u8BFB\u53D6\u8D44\u6599\u7D22\u5F15\uFF1A${error2 instanceof Error ? error2.message : String(error2)}`);
    }
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw storageError("storage_corrupt", "\u8D44\u6599\u7D22\u5F15\u4E0D\u662F\u6709\u6548 JSON\uFF0C\u8BF7\u4ECE backups \u6062\u590D\u6216\u91CD\u5EFA\u7D22\u5F15");
    }
    const parsed = IndexSchema.safeParse(value);
    if (!parsed.success) throw storageError("storage_corrupt", "\u8D44\u6599\u7D22\u5F15\u683C\u5F0F\u635F\u574F\uFF0C\u8BF7\u4ECE backups \u6062\u590D\u6216\u91CD\u5EFA\u7D22\u5F15");
    return parsed.data;
  }
  async readStored(profileId) {
    let raw;
    try {
      raw = await readFile2(join4(this.dataDir, "profiles", `${profileId}.json`), "utf8");
    } catch (error2) {
      if (fileErrorCode(error2) === "ENOENT") throw storageError("profile_missing", "\u6307\u5B9A\u7684\u672C\u5730\u8D44\u6599\u4E0D\u5B58\u5728");
      throw storageError("storage_unavailable", `\u65E0\u6CD5\u8BFB\u53D6\u8D44\u6599\uFF1A${error2 instanceof Error ? error2.message : String(error2)}`);
    }
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw storageError("storage_corrupt", `\u8D44\u6599 ${profileId} \u4E0D\u662F\u6709\u6548 JSON`);
    }
    const parsed = StoredProfileSchema.safeParse(value);
    if (!parsed.success) throw storageError("storage_corrupt", `\u8D44\u6599 ${profileId} \u683C\u5F0F\u635F\u574F\u6216\u7248\u672C\u4E0D\u652F\u6301`);
    return parsed.data;
  }
  async list() {
    await this.initialize();
    const index = await this.readIndex();
    return index.profiles.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  async status() {
    const index = await this.readIndex();
    return { data_dir: this.dataDir, storage_version: 1, profile_count: index.profiles.length };
  }
  async get(profileId) {
    await this.initialize();
    return this.readStored(id.parse(profileId));
  }
  // Planning reads exactly one selected profile without creating an index or files.
  async readForPlanning(profileId, revision) {
    const stored = await this.readStored(id.parse(profileId));
    if (stored.revision !== revision) throw storageError("profile_changed", "\u8D44\u6599\u7248\u672C\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u51C6\u5907");
    return stored.profile;
  }
  async save(rawInput) {
    const input = ProfileSaveSchema.parse(rawInput);
    return this.exclusive(async () => {
      await this.initialize();
      const index = await this.readIndex();
      const now2 = (/* @__PURE__ */ new Date()).toISOString();
      let stored;
      let previous = null;
      if (input.profile_id) {
        previous = await this.readStored(input.profile_id);
        if (previous.revision !== input.expected_revision) throw storageError("profile_changed", `\u8D44\u6599\u5DF2\u7ECF\u66F4\u65B0\uFF1B\u5F53\u524D\u4FEE\u8BA2\u4E3A ${previous.revision}\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u540E\u518D\u4FDD\u5B58`);
        const name = input.name ?? previous.name;
        if (index.profiles.some((item) => item.id !== previous?.id && item.name === name)) throw storageError("name_conflict", "\u5DF2\u6709\u540C\u540D\u8D44\u6599\uFF0C\u8BF7\u6362\u4E00\u4E2A\u540D\u79F0");
        const revision = previous.revision + 1;
        stored = StoredProfileSchema.parse({
          ...previous,
          name,
          revision,
          updated_at: now2,
          source_markdown: input.source_markdown === void 0 ? previous.source_markdown : input.source_markdown,
          profile: mergeChanges(previous.profile, input.changes, revision)
        });
      } else {
        if (index.profiles.length >= 100) throw storageError("profile_limit", "\u672C\u5730\u8D44\u6599\u5DF2\u8FBE\u5230 100 \u4EFD\u4E0A\u9650");
        if (index.profiles.some((item) => item.name === input.name)) throw storageError("name_conflict", "\u5DF2\u6709\u540C\u540D\u8D44\u6599\uFF0C\u8BF7\u6362\u4E00\u4E2A\u540D\u79F0");
        const profileId = randomUUID3();
        stored = StoredProfileSchema.parse({
          format: "resume-companion-profile",
          storage_version: 1,
          id: profileId,
          name: input.name,
          revision: 1,
          created_at: now2,
          updated_at: now2,
          source_markdown: input.source_markdown ?? null,
          profile: mergeChanges(emptyProfile(profileId, 1), input.changes, 1)
        });
      }
      const serialized = JSON.stringify(stored);
      if (Buffer.byteLength(serialized, "utf8") > 1048576) throw storageError("profile_too_large", "\u5355\u4EFD\u8D44\u6599\u8D85\u8FC7 1 MiB\uFF0C\u8BF7\u7CBE\u7B80\u540E\u518D\u4FDD\u5B58");
      if (previous) {
        const historyDir = join4(this.dataDir, "history", previous.id);
        await mkdir3(historyDir, { recursive: true, mode: 448 });
        await atomicWrite(join4(historyDir, `${previous.revision}.json`), previous);
      }
      await atomicWrite(join4(this.dataDir, "profiles", `${stored.id}.json`), stored);
      const nextEntries = index.profiles.filter((item) => item.id !== stored.id);
      nextEntries.push(entryFor(stored));
      await atomicWrite(this.indexPath, { ...index, profiles: nextEntries });
      return { profile: entryFor(stored), changed_sections: Object.keys(input.changes), source_markdown_saved: stored.source_markdown !== null };
    });
  }
  async readView(raw) {
    const params = ProfileReadSchema.parse(raw);
    if (params.record_id && !params.section) throw storageError("invalid_request", "record_id \u9700\u8981\u540C\u65F6\u6307\u5B9A section");
    const stored = await this.get(params.profile_id);
    if (params.expected_revision !== void 0 && params.expected_revision !== stored.revision) {
      throw storageError("profile_changed", `\u8D44\u6599\u5DF2\u7ECF\u66F4\u65B0\uFF1B\u5F53\u524D\u4FEE\u8BA2\u4E3A ${stored.revision}\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u76EE\u5F55\u5E76\u56FA\u5B9A\u65B0\u7684\u4FEE\u8BA2\u53F7`);
    }
    const base = { profile_id: stored.id, name: stored.name, profile_revision: stored.revision, updated_at: stored.updated_at };
    if (params.source_refs) {
      const entries = params.source_refs.map((source_ref) => {
        const value2 = scalarSource(stored.profile, source_ref);
        if (value2 === void 0) throw storageError("source_missing", `\u8D44\u6599\u6765\u6E90\u4E0D\u5B58\u5728\uFF1A${source_ref}`);
        return { source_ref, value: value2, unknown: value2 === null || value2 === "" };
      });
      return { ...base, directory: false, entries };
    }
    if (!params.section) {
      const sectionNames = ["basic", "education", "experience", "projects", "skills", "certificates", "custom_answers", "supplemental_fields", "languages", "awards", "campus", "competitions", "intent", "section_status"];
      const sections = Object.fromEntries(sectionNames.map((section) => {
        const value2 = stored.profile[section];
        return [section, { records: Array.isArray(value2) ? value2.length : 1 }];
      }));
      return { ...base, directory: true, sections, has_source_markdown: stored.source_markdown !== null, source_markdown: params.include_source_markdown ? stored.source_markdown : void 0 };
    }
    let value = stored.profile[params.section];
    if (params.record_id) {
      if (!Array.isArray(value)) throw storageError("invalid_request", "\u8FD9\u4E2A\u680F\u76EE\u4E0D\u652F\u6301 record_id");
      value = value.find((item) => typeof item === "object" && item !== null && "id" in item && item.id === params.record_id);
      if (!value) throw storageError("record_missing", "\u6307\u5B9A\u8BB0\u5F55\u4E0D\u5B58\u5728");
    }
    if (!Array.isArray(value) || params.record_id) return { ...base, directory: false, section: params.section, data: value, source_markdown: params.include_source_markdown ? stored.source_markdown : void 0 };
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 20;
    const data = value.slice(offset, offset + limit);
    return { ...base, directory: false, section: params.section, offset, total: value.length, data, next_offset: offset + data.length < value.length ? offset + data.length : null, source_markdown: params.include_source_markdown ? stored.source_markdown : void 0 };
  }
  async resolveSource(reference) {
    const schema = external_exports.object({ profile_id: id, profile_revision: external_exports.number().int().positive(), source_ref: external_exports.string().min(1).max(240) }).strict();
    const source = schema.parse(reference);
    const stored = await this.get(source.profile_id);
    if (stored.revision !== source.profile_revision) throw storageError("profile_changed", `\u8D44\u6599\u5DF2\u7ECF\u66F4\u65B0\uFF1B\u5F53\u524D\u4FEE\u8BA2\u4E3A ${stored.revision}`);
    const value = scalarSource(stored.profile, source.source_ref);
    if (value === void 0) throw storageError("source_missing", `\u8D44\u6599\u6765\u6E90\u4E0D\u5B58\u5728\uFF1A${source.source_ref}`);
    if (value === null || value === "") throw storageError("source_unknown", "\u8D44\u6599\u672A\u63D0\u4F9B\u8BE5\u4E8B\u5B9E\uFF0C\u4E0D\u81EA\u52A8\u7F16\u9020");
    if (typeof value !== "string" && typeof value !== "boolean") throw storageError("source_type", "\u8D44\u6599\u6765\u6E90\u4E0D\u662F\u5355\u4E2A\u53EF\u586B\u5199\u503C");
    if (typeof value === "string" && value.length > 1e4) throw storageError("source_too_long", "\u8D44\u6599\u6765\u6E90\u8D85\u8FC7\u5355\u6B21\u586B\u5199\u4E0A\u9650");
    return value;
  }
  async rebuildIndex() {
    return this.exclusive(async () => {
      await mkdir3(join4(this.dataDir, "profiles"), { recursive: true, mode: 448 });
      const names = (await readdir(join4(this.dataDir, "profiles"))).filter((name) => name.endsWith(".json"));
      const profiles = [];
      for (const name of names) {
        const profileId = name.slice(0, -5);
        if (!ID_PATTERN.test(profileId)) continue;
        try {
          profiles.push(entryFor(await this.readStored(profileId)));
        } catch {
        }
      }
      let backup;
      try {
        backup = join4(this.dataDir, "backups", `index-${(/* @__PURE__ */ new Date()).toISOString().replaceAll(":", "-")}.json`);
        await copyFile(this.indexPath, backup);
      } catch {
        backup = null;
      }
      const index = { format: "resume-companion-index", storage_version: 1, profiles };
      await atomicWrite(this.indexPath, index);
      return { rebuilt: true, profiles: profiles.length, backup };
    });
  }
};

// src/browser/planning/guopin.ts
function guopinFact(key2, fact2) {
  if (!fact2) return void 0;
  if (key2 === "level" && ["\u7855\u58EB\u7814\u7A76\u751F", "\u535A\u58EB\u7814\u7A76\u751F"].includes(String(fact2.value))) return { ...fact2, value: String(fact2.value).replace("\u7814\u7A76\u751F", "") };
  if (key2 === "company_type" && fact2.value === "\u56FD\u6709\u4F01\u4E1A") return { ...fact2, value: "\u56FD\u4F01" };
  if (key2 === "company_type" && fact2.value === "\u9AD8\u7B49\u9662\u6821") return { ...fact2, value: "\u5B66\u6821" };
  if (key2 === "company_headcount") {
    if (typeof fact2.value !== "string" || !/^\d+$/.test(fact2.value)) return void 0;
    const count = Number(fact2.value), bounds = [100, 300, 500, 1e3, 2e3, 5e3, 1e4, 3e4];
    for (let i = 0; i < bounds.length - 1; i++) if (count > bounds[i] && count < bounds[i + 1]) return { ...fact2, value: `${bounds[i]}-${bounds[i + 1]}\u4EBA` };
    if (count > 3e4) return { ...fact2, value: "30000\u4EBA\u4EE5\u4E0A" };
    return void 0;
  }
  if (["salary_min", "salary_max"].includes(key2)) {
    if (typeof fact2.value !== "string" || !/^\d+$/.test(fact2.value) || Number(fact2.value) % 1e3 !== 0) return void 0;
    return { ...fact2, value: `${Number(fact2.value) / 1e3}K` };
  }
  if (key2 === "monthly_salary_yuan") {
    if (typeof fact2.value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(fact2.value)) return void 0;
    return { ...fact2, value: String(Number(fact2.value) / 1e3) };
  }
  if (key2 === "guopin_certificate_paths") {
    try {
      const paths = typeof fact2.value === "string" ? JSON.parse(fact2.value) : fact2.value;
      if (!Array.isArray(paths) || !paths.length || !paths.every((p) => typeof p === "string" && p.split(" / ").length >= 2 && p.split(" / ").length <= 3 && p.split(" / ").every((s) => s.trim() === s && s.length > 0))) return void 0;
      return new Set(paths.map((p) => p.split(" / ").at(-1))).size === paths.length ? { ...fact2, value: paths } : void 0;
    } catch {
      return void 0;
    }
  }
  if (key2.endsWith("_path")) {
    try {
      const path = typeof fact2.value === "string" ? JSON.parse(fact2.value) : fact2.value;
      return Array.isArray(path) && path.length >= 2 && path.length <= 4 && path.every((s) => typeof s === "string" && s.length > 0) ? { ...fact2, value: path } : void 0;
    } catch {
      return void 0;
    }
  }
  if (key2 === "has_overseas" && ["\u6709\u6D77\u5916\u7559\u5B66\u7ECF\u5386", "\u65E0\u6D77\u5916\u7559\u5B66\u7ECF\u5386"].includes(String(fact2.value))) return { ...fact2, value: fact2.value === "\u6709\u6D77\u5916\u7559\u5B66\u7ECF\u5386" ? "\u6D77\u5916\u7559\u5B66\u7ECF\u5386" : "\u975E\u6D77\u5916\u7559\u5B66\u7ECF\u5386" };
  if (key2 === "overseas" && ["\u662F", "\u5426"].includes(String(fact2.value))) return { ...fact2, value: fact2.value === "\u662F" ? "\u6D77\u5916\u5DE5\u4F5C\u7ECF\u5386" : "\u975E\u6D77\u5916\u5DE5\u4F5C\u7ECF\u5386" };
  return fact2;
}

// src/browser/planning/dayee.ts
function isFawEditor(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "faw-zhaopin.hotjob.cn" && u.pathname === "/SU603374380dcad4635b836531/pb/resumeOperation.html";
  } catch {
    return false;
  }
}
var newRecordKeys = {
  "\u5B9E\u4E60\u7ECF\u5386": ["start", "end", "organization", "company_type", "company_size", "description"],
  "\u6280\u80FD\u8D44\u8D28": ["name"]
};
function dayeeInferredRules(rules, section, url) {
  const keys = isFawEditor(url) ? newRecordKeys[section] : void 0;
  return [...new Set(rules.map((r) => r.key))].filter((key2) => !keys || keys.includes(key2)).map((key2) => {
    const aliases = rules.filter((r) => r.key === key2);
    return { ...aliases[0], labels: [...new Set(aliases.flatMap((r) => r.labels))] };
  });
}
function dayeeFieldRules(rules, url) {
  return isFawEditor(url) ? rules.map((rule) => rule.key === "training_mode" ? { ...rule, key: "highest_study_mode" } : rule.key === "overall" && rule.labels.includes("\u5176\u4ED6\u5916\u8BED\u6C34\u5E73") ? { ...rule, key: "conversation" } : rule) : rules;
}
function fawEnglishLevel(exam, score) {
  if (!exam || !score || !/^CET[46]$/.test(String(exam.value)) || !/^\d{1,3}$/.test(String(score.value))) return void 0;
  const n = Number(score.value);
  if (n < 0 || n > 710) return void 0;
  const level = String(exam.value).slice(-1);
  return { value: `CET ${level}-${n >= 425 ? "425\u5206\u53CA\u4EE5\u4E0A" : level === "6" ? "425\u4EE5\u4E0B" : "425\u5206\u4EE5\u4E0B"}`, source: `${exam.source}+${score.source}` };
}
function fawOption(key2, value) {
  if (key2 === "failed_courses" && value === "\u65E0") return "\u65E0\u6302\u79D1";
  if (key2 === "recruitment_channel" && value === "\u5B66\u6821\u5C31\u4E1A\u4FE1\u606F\u7F51") return "\u5B66\u6821\u5C31\u4E1A\u7F51";
  if (key2 === "scholarship_status" && typeof value === "string" && /^校级(?:一|二|三)等奖学金(?:（虚构测试）)?$/.test(value)) return "\u6821\u7EA7\u5956\u5B66\u91D1";
  if (key2 === "political_status" && value === "\u5171\u9752\u56E2\u5458") return "\u4E2D\u56FD\u5171\u4EA7\u4E3B\u4E49\u9752\u5E74\u56E2\u56E2\u5458";
  if (key2 === "company_type" && value === "\u6C11\u8425\u4F01\u4E1A") return "\u6C11\u8425/\u79C1\u8425\u516C\u53F8";
  if (key2 === "company_type" && value === "\u56FD\u6709\u4F01\u4E1A") return "\u56FD\u4F01/\u4E0A\u5E02\u516C\u53F8";
  if (["native_city", "residence_city", "city"].includes(key2) && value === "\u676D\u5DDE") return "\u676D\u5DDE\u5E02";
  if (key2 === "major_rank" && typeof value === "string" && /^前(?:[1-9]|10)%$/.test(value)) return "1%~10%";
  return value;
}

// src/profile-facts.ts
import { createHash as createHash3 } from "node:crypto";
function preparationQuestionId(section, record2, key2) {
  return `q_${createHash3("sha256").update(JSON.stringify([section, record2, key2])).digest("hex").slice(0, 24)}`;
}
function preparationAnswerState(profile, section, record2, key2) {
  const state = profile.supplemental_fields.find((f2) => f2.field_key === `preparation.status.${preparationQuestionId(section, record2, key2)}`)?.value;
  return state === "not_applicable" || state === "withheld" || state === "deferred" ? state : void 0;
}
var degreeNames = { high_school: "\u9AD8\u4E2D", associate: "\u5927\u4E13", bachelor: "\u672C\u79D1", master: "\u7855\u58EB\u7814\u7A76\u751F", doctor: "\u535A\u58EB\u7814\u7A76\u751F" };
function normalizeProfile(profile) {
  const supplementalValues = /* @__PURE__ */ new Map();
  for (const field of profile.supplemental_fields) {
    if (field.value === null || field.value === "") continue;
    const prior = supplementalValues.get(field.field_key);
    if (prior !== void 0 && prior !== field.value) throw new Error("supplemental_source_conflict");
    supplementalValues.set(field.field_key, field.value);
  }
  const result = {};
  const prefix = `profile:${profile.profile_id}@${profile.revision}/`;
  function record2(section, id3, raw, paths, anchors2) {
    const facts = {};
    for (const [key2, value] of Object.entries(raw)) {
      if (value === null || value === void 0 || value === "" || Array.isArray(value) && !value.length) continue;
      facts[key2] = { value, source: prefix + (paths[key2] ?? `${section}/${id3}/${key2}`) };
    }
    (result[section] ??= { presence: "unknown", records: [] }).records.push({ id: id3, section, facts, anchors: anchors2 });
  }
  record2("basic", "basic", profile.basic, Object.fromEntries(Object.keys(profile.basic).map((k) => [k, `basic/${k}`])), []);
  const salary2 = (s) => s ? `${s.amount} ${s.currency}/${s.period === "month" ? "\u6708" : "\u5E74"}${s.tax === "before" ? "\uFF08\u7A0E\u524D\uFF09" : s.tax === "after" ? "\uFF08\u7A0E\u540E\uFF09" : ""}${s.benefits === "included" ? "\uFF08\u542B\u798F\u5229\uFF09" : s.benefits === "excluded" ? "\uFF08\u4E0D\u542B\u798F\u5229\uFF09" : ""}` : null;
  record2("intent", "intent", { cities: profile.intent.cities, current_salary: salary2(profile.intent.current_salary), expected_salary: salary2(profile.intent.expected_salary), available_date: profile.intent.available_date, industry: profile.intent.industry, occupation: profile.intent.occupation }, Object.fromEntries(Object.keys(profile.intent).map((k) => [k, `intent/${k}`])), []);
  function dates(row) {
    return { start: row.start_month, end: row.end_month, current: row.end_month ? false : row.is_current, range: row.start_month && (row.end_month || row.is_current === true) ? { start: row.start_month, ...row.end_month ? { end: row.end_month } : { current: true } } : null };
  }
  for (const row of profile.education) record2("education", row.id, { school: row.school, major: row.major, college: row.college, level: row.education_level ? degreeNames[row.education_level] : null, degree: row.degree, study_mode: row.study_mode === "full_time" ? "\u5168\u65E5\u5236" : row.study_mode === "part_time" ? "\u975E\u5168\u65E5\u5236" : null, description: row.description, ...dates(row) }, { range: `education/${row.id}/start_month+end_month+is_current`, level: `education/${row.id}/education_level`, start: `education/${row.id}/start_month`, end: `education/${row.id}/end_month`, current: `education/${row.id}/end_month+is_current` }, ["school", "start", "end"]);
  for (const row of profile.experience) {
    const kind = row.kind === "internship" ? "internships" : row.kind === "work" ? "work" : "unclassified_experience";
    record2(kind, row.id, { organization: row.organization, role: row.role, description: row.description ?? (row.facts.length ? row.facts.map((f2) => f2.text).join("\n") : null), ...dates(row) }, Object.fromEntries(["organization", "role", "description", "range", "start", "end", "current"].map((k) => [k, `experience/${row.id}/${k === "description" ? "description+facts" : k === "range" ? "start_month+end_month+is_current" : k === "start" ? "start_month" : k === "end" ? "end_month" : k === "current" ? "end_month+is_current" : k}`])), ["organization", "role", "start", "end"]);
  }
  for (const row of profile.projects) record2("projects", row.id, { name: row.name, role: row.role, description: row.description, responsibilities: row.responsibilities ?? (row.facts.length ? row.facts.map((f2) => f2.text).join("\n") : null), url: row.url, ...dates(row) }, { range: `projects/${row.id}/start_month+end_month+is_current`, responsibilities: `projects/${row.id}/responsibilities+facts`, start: `projects/${row.id}/start_month`, end: `projects/${row.id}/end_month`, current: `projects/${row.id}/end_month+is_current` }, ["name", "start", "end"]);
  for (const key2 of ["languages", "awards", "certificates", "competitions", "campus"]) for (const row of profile[key2]) {
    const { id: recordId, ...data } = { ...row, ...key2 === "campus" ? dates(row) : {} };
    record2(key2, row.id, data, {}, key2 === "languages" ? ["name"] : key2 === "campus" ? ["organization", "role", "start", "end"] : ["name", "obtained_month"]);
  }
  for (const row of profile.custom_answers) record2("custom_answers", row.id, { text: row.text }, { text: `custom_answers/${row.id}` }, []);
  for (const row of profile.supplemental_fields) record2("supplemental_fields", row.id, { value: row.value }, { value: `supplemental_fields/${row.id}` }, []);
  if (profile.skills.length) record2("skills", "skills", { text: profile.skills.join("\u3001") }, { text: "skills" }, []);
  const extensions = /* @__PURE__ */ new Map();
  for (const field of profile.supplemental_fields) {
    const match = /^(family|research|it_skills)\.([A-Za-z0-9_-]+)\.([a-z_]+)$/.exec(field.field_key);
    if (!match || !field.value) continue;
    const section = match[1], recordId = match[2], key2 = match[3];
    const bucket = `${section}.${recordId}`;
    const group = extensions.get(bucket) ?? { section, id: recordId, values: {}, paths: {} };
    group.values[key2] = field.value;
    group.paths[key2] = `supplemental_fields/${field.id}`;
    extensions.set(bucket, group);
  }
  for (const group of extensions.values()) record2(group.section, group.id, group.values, group.paths, group.section === "family" ? ["name", "relation"] : group.section === "research" ? ["name", "start", "end"] : ["name"]);
  for (const section of ["family", "research", "it_skills"]) {
    const source = result[section] ??= { presence: "unknown", records: [] };
    if (!source.records.length && profile.supplemental_fields.some((f2) => f2.field_key === `section_status.${section}` && f2.value === "none")) source.presence = "none";
  }
  for (const key2 of Object.keys(profile.section_status)) {
    const k = key2;
    const section = result[key2] ??= { presence: "unknown", records: [] };
    section.presence = section.records.length ? "provided" : profile.section_status[k];
  }
  for (const section of Object.values(result)) if (section.records.some((r) => Object.keys(r.facts).length)) section.presence = "provided";
  return result;
}
function resolveFact(profile, sources, row, rule) {
  if (rule.key === "cities" && !row.facts.cities) return sources.intent?.records[0]?.facts.cities;
  if (row.facts[rule.key]) return row.facts[rule.key];
  if (row.section === "education" && ["school_other", "major_other"].includes(rule.key)) {
    const school = rule.key === "school_other", category = resolveFact(profile, sources, row, { key: school ? "job51_school_region" : "job51_major_category" });
    if (category?.value === (school ? "\u5176\u4ED6\u9662\u6821" : "\u5176\u4ED6\u4E13\u4E1A\u7C7B\u578B")) return row.facts[school ? "school" : "major"];
  }
  if (row.section === "basic" && rule.key === "self_career_description") {
    const self = row.facts.self_description, career = resolveFact(profile, sources, row, { key: "career_plan" });
    return self && career ? { value: `${self.value}

${career.value}`, source: `${self.source}+${career.source}` } : void 0;
  }
  const parent = /^(father|mother)_(name|organization_role)$/.exec(rule.key);
  if (row.section === "basic" && parent) {
    const relation = parent[1] === "father" ? "\u7236\u4EB2" : "\u6BCD\u4EB2";
    const relatives = (sources.family?.records ?? []).filter((r) => r.facts.relation?.value === relation);
    if (relatives.length !== 1) return void 0;
    const facts = relatives[0].facts;
    if (parent[2] === "name") return facts.name;
    if (facts.organization && facts.role) return { value: `${facts.organization.value} / ${facts.role.value}`, source: `${facts.organization.source}+${facts.role.source}` };
    return void 0;
  }
  if (row.section === "basic" && rule.key === "skills_text" && sources.skills?.records[0]?.facts.text) return sources.skills.records[0].facts.text;
  if (row.section === "basic" && rule.key === "certificate_names") {
    const names = (sources.certificates?.records ?? []).map((r) => r.facts.name).filter((f2) => Boolean(f2));
    if (names.length) return { value: names.map((f2) => f2.value).join("\u3001"), source: `profile:${profile.profile_id}@${profile.revision}/certificates/names` };
  }
  const source = row.section ?? Object.entries(sources).find(([, s]) => s.records.some((r) => r.id === row.id))?.[0];
  const path = source === "basic" || source === "intent" ? `${source}.${rule.key}` : `${source}.${row.id}.${rule.key}`;
  const supplemental2 = profile.supplemental_fields.find((f2) => f2.field_key === path);
  if (!supplemental2?.value && rule.key === "full_time" && ["\u5168\u65E5\u5236", "\u975E\u5168\u65E5\u5236"].includes(String(row.facts.study_mode?.value))) {
    return { ...row.facts.study_mode, value: row.facts.study_mode.value === "\u5168\u65E5\u5236" ? "\u662F" : "\u5426" };
  }
  if (supplemental2?.value) return { value: supplemental2.value, source: `profile:${profile.profile_id}@${profile.revision}/supplemental_fields/${supplemental2.id}` };
  if (rule.emptyBranch) {
    const parent2 = resolveFact(profile, sources, row, { key: rule.emptyBranch.key });
    if (parent2?.value === rule.emptyBranch.value) return parent2;
  }
  return void 0;
}

// src/browser/form-plan.ts
import { createHash as createHash4 } from "node:crypto";
var id2 = external_exports.string().min(1).max(120);
var label = external_exports.string().min(1).max(240);
var date2 = external_exports.string().regex(/^\d{4}-\d{2}(?:-\d{2})?$/);
var range = external_exports.object({ start: date2, end: date2.optional(), current: external_exports.boolean().optional() }).strict();
var scalar = external_exports.union([external_exports.string().max(2e4), external_exports.number().finite(), external_exports.boolean()]);
var factSchema = external_exports.object({
  value: external_exports.union([scalar, external_exports.array(external_exports.string().min(1).max(500)).max(80), range]),
  source: external_exports.string().min(1).max(500)
}).strict();
var actionFields = {
  id: id2,
  field: label,
  source_ref: id2,
  overwrite: external_exports.boolean().default(false),
  depends_on: external_exports.array(id2).max(500).default([])
};
var planStepSchema = external_exports.discriminatedUnion("action", [
  external_exports.object({ ...actionFields, action: external_exports.literal("fill") }).strict(),
  external_exports.object({ ...actionFields, action: external_exports.literal("select"), selection_mode: external_exports.enum(["add", "replace"]).default("replace"), query_from_value: external_exports.boolean().default(false), allow_custom: external_exports.boolean().default(false) }).strict(),
  external_exports.object({ ...actionFields, action: external_exports.literal("path") }).strict(),
  external_exports.object({ ...actionFields, action: external_exports.literal("date") }).strict()
]);
var formPlanSchema = external_exports.object({
  schema_version: external_exports.literal(1),
  page_id: external_exports.number().int().positive(),
  navigation_id: id2,
  observation_id: id2,
  profile_revision: id2,
  test_mode: external_exports.boolean().default(false),
  facts: external_exports.record(id2, factSchema),
  records: external_exports.array(external_exports.object({
    id: id2,
    section: label,
    mode: external_exports.enum(["existing", "new", "reveal"]),
    binding: id2.optional(),
    add_target: label.default("\u6DFB\u52A0"),
    steps: external_exports.array(planStepSchema).max(500)
  }).strict()).min(1).max(100),
  protected_fields: external_exports.array(external_exports.object({ record_id: id2, field: label }).strict()).max(500).default([]),
  unresolved: external_exports.array(external_exports.object({
    record_id: id2,
    field: label,
    status: external_exports.enum(["missing_information", "needs_judgment", "keep_existing"]),
    reason: external_exports.string().min(1).max(500)
  }).strict()).max(500).default([]),
  budget_ms: external_exports.number().int().min(1e3).max(18e4).default(18e4)
}).strict();
var targetKey = (record2, field) => `${record2}\0${field.trim().toLowerCase()}`;
function validDate(value) {
  const [year, month3, day] = value.split("-").map(Number);
  if (!year || !month3 || month3 < 1 || month3 > 12) return false;
  return day === void 0 || day > 0 && day <= new Date(Date.UTC(year, month3, 0)).getUTCDate();
}
function validateFormPlan(input) {
  let encoded;
  try {
    encoded = JSON.stringify(input);
  } catch {
    return { ok: false, issues: [{ code: "invalid_json", path: "plan" }] };
  }
  if (!encoded || Buffer.byteLength(encoded) > 1048576) return { ok: false, issues: [{ code: "plan_too_large", path: "plan" }] };
  const parsed = formPlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((issue2) => ({ code: issue2.code, path: issue2.path.join(".") })) };
  const plan = parsed.data;
  const issues = [];
  const error2 = (code, path) => {
    issues.push({ code, path });
  };
  const records = /* @__PURE__ */ new Set();
  const bindings = /* @__PURE__ */ new Set();
  const actions = /* @__PURE__ */ new Map();
  const owners = /* @__PURE__ */ new Map();
  const targets = /* @__PURE__ */ new Set();
  const protectedFields = new Set(plan.protected_fields.map((p) => targetKey(p.record_id, p.field)));
  let count = 0;
  for (const [recordIndex, record2] of plan.records.entries()) {
    const path = `records.${recordIndex}`;
    if (records.has(record2.id)) error2("duplicate_record", path);
    records.add(record2.id);
    if (record2.mode === "existing" && !record2.binding || record2.mode !== "existing" && record2.binding) error2("invalid_record_binding", path);
    if (record2.mode !== "existing" && !record2.steps.length) error2("empty_new_record", path);
    if (record2.binding) {
      if (bindings.has(record2.binding)) error2("duplicate_binding", path);
      bindings.add(record2.binding);
    }
    if (isManualTarget(record2.section) || isManualTarget(record2.add_target, record2.section)) error2("manual_boundary", path);
    for (const [stepIndex, step] of record2.steps.entries()) {
      count++;
      const stepPath = `${path}.steps.${stepIndex}`;
      if (actions.has(step.id)) error2("duplicate_action", stepPath);
      actions.set(step.id, step);
      owners.set(step.id, recordIndex);
      const target = targetKey(record2.id, step.field);
      if ([...targets].some((other) => other === target || other.startsWith(`${target} / `) || target.startsWith(`${other} / `))) error2("conflicting_target", stepPath);
      targets.add(target);
      if ([...protectedFields].some((other) => other === target || other.startsWith(`${target} / `) || target.startsWith(`${other} / `))) error2("protected_field", stepPath);
      if (step.field.startsWith("field:")) error2("plan_requires_semantic_label", stepPath);
      if (isManualTarget(step.field, record2.section)) error2("manual_boundary", stepPath);
      const fact2 = plan.facts[step.source_ref];
      if (!fact2) {
        error2("missing_fact", stepPath);
        continue;
      }
      const value = fact2.value;
      if (step.action === "fill" && typeof value === "object") error2("invalid_fill_value", stepPath);
      if (step.action === "select" && !(typeof value === "string" && value.length > 0 || Array.isArray(value))) error2("invalid_select_value", stepPath);
      if (step.action === "select" && (step.query_from_value || step.allow_custom) && typeof value !== "string") error2("custom_requires_scalar", stepPath);
      if (step.action === "path" && !(Array.isArray(value) && value.length > 0)) error2("invalid_path_value", stepPath);
      if (step.action === "date") {
        if (typeof value === "string") {
          if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(value) || !validDate(value)) error2("invalid_date", stepPath);
        } else if (typeof value !== "object" || Array.isArray(value) || !validDate(value.start) || value.current && value.end || !value.current && (!value.end || !validDate(value.end) || value.start.length !== value.end.length || value.start > value.end)) error2("invalid_range", stepPath);
      }
    }
  }
  if (count > 500) error2("too_many_actions", "records");
  for (const [index, entry] of plan.protected_fields.entries()) {
    if (!records.has(entry.record_id)) error2("unknown_record", `protected_fields.${index}`);
    else if (plan.records.find((record2) => record2.id === entry.record_id)?.mode !== "existing") error2("protected_record_must_exist", `protected_fields.${index}`);
  }
  for (const [index, entry] of plan.unresolved.entries()) {
    if (!records.has(entry.record_id)) error2("unknown_record", `unresolved.${index}`);
    if (targets.has(targetKey(entry.record_id, entry.field))) error2("conflicting_disposition", `unresolved.${index}`);
  }
  for (const [actionId, step] of actions) for (const dependency of step.depends_on) {
    if (!actions.has(dependency)) error2("unknown_dependency", `action.${actionId}`);
    else if (owners.get(dependency) > owners.get(actionId)) error2("forward_record_dependency", `action.${actionId}`);
  }
  const visiting = /* @__PURE__ */ new Set(), visited = /* @__PURE__ */ new Set();
  const visit = (key2) => {
    if (visiting.has(key2)) {
      error2("dependency_cycle", `action.${key2}`);
      return;
    }
    if (visited.has(key2)) return;
    visiting.add(key2);
    for (const dependency of actions.get(key2)?.depends_on ?? []) if (actions.has(dependency)) visit(dependency);
    visiting.delete(key2);
    visited.add(key2);
  };
  for (const key2 of actions.keys()) visit(key2);
  if (issues.length) return { ok: false, issues };
  return { ok: true, plan, digest: createHash4("sha256").update(JSON.stringify(plan)).digest("hex") };
}

// src/browser/planning/compiler.ts
var policySchema = external_exports.object({ records: external_exports.enum(["preserve", "append"]).default("preserve"), bindings: external_exports.array(external_exports.object({ scope: external_exports.string().min(1).max(240), field: external_exports.string().min(1).max(240), source_ref: external_exports.string().min(1).max(240) }).strict()).max(50).default([]), overwrite_fields: external_exports.array(external_exports.object({ section: external_exports.string().max(240), field: external_exports.string().max(240) }).strict()).max(100).default([]) }).strict().default({});
var nonempty = (f2) => f2.checked === true || f2.checked === null && Boolean(f2.value);
var button = (f2) => f2.tag === "button" || f2.role === "button";
var identity = /^(姓名|手机号|手机号码|邮箱|个人证件|证件号码|身份证号码?|居民身份证号)(\s*\/.*)?$/;
var keyOf = (f2) => `${f2.frame}:${f2.scope}:${f2.index}`;
function moduleSelection(recipe2, catalog, sections, dispositions, manualTasks2, plan) {
  if (!recipe2) return [];
  const pageModules = [.../* @__PURE__ */ new Set([
    ...catalog.raw.sections.filter((section) => recipe2.sections.some((rule) => rule.sections.includes(section))),
    ...catalog.records.map((record2) => record2.section).filter((section) => recipe2.sections.some((rule) => rule.sections.includes(section))),
    ...catalog.raw.fields.filter((field) => field.plannerFamily === recipe2.family).map((field) => sectionOf(field.scope)).filter((section) => recipe2.sections.some((rule) => rule.sections.includes(section)))
  ])];
  return pageModules.map((page_module) => {
    const rule = recipe2.sections.find((candidate) => candidate.sections.includes(page_module));
    const sourceStates = rule.sources.map((source) => sections.find((section) => section.section === source) ?? { section: source, presence: "unknown", records: 0 });
    const profile_state = sourceStates.some((source) => source.presence === "provided") ? "provided" : sourceStates.every((source) => source.presence === "none") ? "none" : "unknown";
    const records = plan?.records.filter((record2) => record2.section === page_module) ?? [];
    const planned_steps = records.reduce((total, record2) => total + record2.steps.length, 0);
    const moduleDispositions = dispositions.filter((disposition) => sectionOf(disposition.scope) === page_module);
    const manual_task_count = manualTasks2.filter((task) => sectionOf(task.scope) === page_module).length;
    const preserved = moduleDispositions.some((disposition) => ["protected", "preserved", "site_derived"].includes(disposition.status));
    const unsupported = moduleDispositions.some((disposition) => ["unsupported_variant", "unmapped_field", "field_mapping_ambiguous", "record_mapping_ambiguous"].includes(disposition.status));
    const decision = planned_steps ? "planned" : preserved ? "preserve_existing" : profile_state === "none" ? "skip_no_profile_data" : profile_state === "unknown" ? "needs_profile_input" : manual_task_count ? "manual" : unsupported ? "unsupported" : "preserve_existing";
    return { page_module, profile_sections: rule.sources, profile_state, profile_records: sourceStates.reduce((total, source) => total + source.records, 0), decision, planned_records: records.length, planned_steps, manual_task_count };
  });
}
var parentLabel = (label2) => {
  for (const [child, parent] of [["\u57CE\u5E02", "\u7701\u4EFD"], ["\u7B49\u7EA7", "\u7C7B\u578B"], ["\u540D\u79F0", "\u7C7B\u522B"], ["\u804C\u4F4D", "\u804C\u7C7B"], ["\u7C7B\u522B", "\u7C7B\u578B"], ["\u660E\u7EC6", "\u7C7B\u522B"]]) if (label2.endsWith(` / ${child}`)) return label2.slice(0, -child.length) + parent;
  return void 0;
};
function combined(row) {
  const parts = ["description", "responsibilities"].map((k) => row.facts[k]).filter((f2) => Boolean(f2));
  return { ...row, facts: { ...row.facts, ...parts.length ? { combined_description: { value: [...new Set(parts.map((f2) => f2.value))].join("\n"), source: parts[0].source.replace(/\/[^/]+$/, "/description+responsibilities+facts") } } : {} } };
}
function projectValue(rule, fact2, recipe2) {
  let v = fact2.value;
  if (rule.transform === "birth_month" && typeof v === "string") v = v.slice(0, 7);
  if (rule.transform === "cities_text" && Array.isArray(v)) v = v.join("\u3001");
  if (rule.transform === "degree" && ["sd", "ud"].includes(recipe2.family) && typeof v === "string") v = { "\u7855\u58EB\u7814\u7A76\u751F": "\u7855\u58EB", "\u535A\u58EB\u7814\u7A76\u751F": "\u535A\u58EB" }[v] ?? v;
  if (rule.transform === "study_mode" && recipe2.family === "ud" && v === "\u5168\u65E5\u5236") v = "\u7EDF\u62DB\u5168\u65E5\u5236";
  return v;
}
function display(v) {
  return typeof v === "object" && !Array.isArray(v) ? [v.start, v.current ? "\u81F3\u4ECA" : v.end].filter(Boolean).join(" / ") : Array.isArray(v) ? v.join(" / ") : String(v);
}
function inferredField(rule, section, recipe2) {
  const dayeeLabels = {
    "\u5B9E\u4E60\u7ECF\u5386": { organization: "\u4F01\u4E1A\u540D\u79F0", description: "\u5DE5\u4F5C\u63CF\u8FF0" },
    "\u5DE5\u4F5C\u7ECF\u5386": { organization: "\u4F01\u4E1A\u540D\u79F0", description: "\u5DE5\u4F5C\u63CF\u8FF0" },
    "\u6280\u80FD\u8D44\u8D28": { name: "\u4E13\u4E1A\u6280\u80FD\u8BC1\u4E66\u540D\u79F0" },
    "\u6821\u5185\u804C\u52A1": { organization: "\u7EC4\u7EC7/\u56E2\u4F53\u540D\u79F0", role: "\u62C5\u4EFB\u804C\u52A1", description: "\u804C\u8D23\u548C\u6210\u5C31" },
    "\u5176\u4ED6\u5916\u8BED\u80FD\u529B": { name: "\u5176\u4ED6\u5916\u8BED\u79CD\u7C7B", overall: "\u5176\u4ED6\u5916\u8BED\u6C34\u5E73" }
  };
  const preferred = recipe2.family === "dayee" ? dayeeLabels[section]?.[rule.key] : void 0;
  const date5 = ["range", "start", "end", "obtained_month", "birth_date"].includes(rule.key);
  const choice = ["level", "study_mode", "degree", "overall", "speaking", "writing"].includes(rule.key) || rule.key === "school" && recipe2.family !== "ud" || rule.key === "name" && section === "\u8BED\u8A00\u80FD\u529B" && recipe2.family === "ud";
  return { frame: 0, index: -1, tag: rule.key === "current" ? "input" : "input", role: rule.key === "range" ? "date-group" : "", type: rule.key === "current" ? "checkbox" : "text", label: preferred && rule.labels.includes(preferred) ? preferred : recipe2.family === "ud" && rule.key === "major" ? "\u4E13\u4E1A" : recipe2.family === "ud" && rule.key === "name" && section === "\u8BED\u8A00\u80FD\u529B" ? "\u8BED\u8A00" : recipe2.family === "ud" && rule.key === "overall" ? "\u7CBE\u901A\u7A0B\u5EA6" : recipe2.family === "sd" && rule.key === "range" && section === "\u6559\u80B2\u80CC\u666F" ? "\u5C31\u8BFB\u65F6\u95F4" : recipe2.family === "sd" && rule.key === "description" && ["\u5DE5\u4F5C\u7ECF\u5386", "\u5B9E\u4E60\u7ECF\u5386"].includes(section) ? "\u5DE5\u4F5C\u804C\u8D23" : rule.labels.includes(section) ? section : rule.labels[0], scope: section, value: "", checked: rule.key === "current" ? false : null, inputMode: date5 ? "date" : rule.key === "current" ? "boolean" : choice ? "choice" : "text", plannerFamily: recipe2.family, disabled: false, readonly: false, required: false, visible: true, options: [], constraints: { minlength: null, maxlength: null, min: null, max: null, step: null, pattern: null }, invalid: false, error: "" };
}
function compilePlan(catalog, profile, policy, testMode = false) {
  const recipe2 = recipeFor(catalog.raw.fields);
  const company = recipe2?.family === "job51" && catalog.raw.url ? new URL(catalog.raw.url).searchParams.get("CtmID") : null;
  const sources = normalizeProfile(profile), dispositions = [], source_dispositions = [];
  const sections = Object.entries(sources).map(([section, s]) => ({ section, presence: s.presence, records: s.records.length }));
  const manual_tasks = manualTasks(catalog.raw);
  if (!recipe2) {
    const dispositions2 = catalog.raw.fields.filter((f2) => !button(f2)).map((f2) => ({ scope: f2.scope, field: f2.label, status: "unsupported_variant", required: f2.required }));
    return { manual_tasks, recipe: null, plan: null, dispositions: dispositions2, source_dispositions, sections, module_selection: [] };
  }
  const plan = { schema_version: 1, page_id: catalog.page_id, navigation_id: catalog.navigation_id, observation_id: catalog.observation_id, profile_revision: `${profile.profile_id}@${profile.revision}`, test_mode: testMode, facts: {}, records: [], protected_fields: [], unresolved: [], budget_ms: 18e4 };
  const handled = /* @__PURE__ */ new Set(), consumed = /* @__PURE__ */ new Set(), usedSources = /* @__PURE__ */ new Set();
  let reobserve_after_execution = false;
  const dynamicEffects = [];
  const record_sources = [];
  const addDisposition = (f2, status, record2) => {
    if (f2.index >= 0) handled.add(keyOf(f2));
    const manual2 = manualReason(f2);
    dispositions.push({ scope: f2.scope, field: f2.label, status: manual2 ? `manual_${manual2}` : status, required: f2.required, ...record2 ? { source_record: record2 } : {} });
  };
  const allSections = [.../* @__PURE__ */ new Set([...catalog.raw.sections, ...catalog.records.map((r) => r.section)])].filter((section) => recipe2.family !== "guopin" || catalog.raw.fields.some((f2) => f2.plannerFamily === "guopin" && (f2.scope === section || f2.scope.startsWith(`${section} / \u7B2C`)) && !button(f2)));
  function conflictingSource(fact2) {
    const path = fact2.source.split("/").slice(1).join("/");
    return profile.supplemental_fields.some((s) => s.value !== null && s.field_key.replaceAll(".", "/") === path && s.value !== display(fact2.value));
  }
  const factFor = (row, rule) => resolveFact(profile, sources, row, rule);
  function fieldFact(row, rule, field) {
    if (recipe2?.family === "dayee" && isFawEditor(catalog.raw.url) && field.label === "\u82F1\u8BED\u7B49\u7EA7") return fawEnglishLevel(factFor(row, { key: "exam_type", labels: [] }), factFor(row, { key: "score", labels: [] }));
    if (recipe2?.family === "dayee" && ["major", "highest_major"].includes(rule.key)) {
      const option = factFor(row, { key: `${rule.key}_option`, labels: [] });
      if (option) return option;
    }
    const fact2 = recipe2?.family === "guopin" ? guopinFact(rule.key, factFor(row, rule)) : factFor(row, rule);
    if ((field.datePrecision === "date" || recipe2?.family === "dayee" && isFawEditor(catalog.raw.url) && /^(开始时间|结束时间|考试时间)$/.test(field.label)) && typeof fact2?.value === "string" && /^\d{4}-\d{2}$/.test(fact2.value)) {
      const full = factFor(row, { key: rule.key.endsWith("_month") ? rule.key.replace(/_month$/, "_date") : `${rule.key}_date`, labels: [] });
      if (full && typeof full.value === "string" && full.value.startsWith(`${fact2.value}-`)) return full;
    }
    return fact2;
  }
  for (const section of allSections) {
    let rule = recipe2.sections.find((r) => r.sections.includes(section));
    if (!rule) continue;
    if (recipe2.family === "phoenix" && section === "\u5DE5\u4F5C\u7ECF\u5386" && allSections.includes("\u5B9E\u4E60\u7ECF\u5386")) rule = { ...rule, sources: ["work"] };
    if (recipe2.family === "dayee" && ["\u5B9E\u4E60\u7ECF\u5386", "\u5DE5\u4F5C\u7ECF\u5386"].includes(section)) rule = { ...rule, sources: [section === "\u5B9E\u4E60\u7ECF\u5386" ? "internships" : "work"] };
    const inputRows = rule.sources.flatMap((source) => (sources[source]?.records ?? []).map((row) => combined(row)).filter((row) => rule.fields.some((r) => Boolean(factFor(row, r))))).filter((row) => !rule.record_filter || (rule.record_filter === "english" ? /^(英语|english)$/i.test(String(row.facts.name?.value ?? "")) : !/^(英语|english)$/i.test(String(row.facts.name?.value ?? ""))));
    if (recipe2.family === "dayee" && rule.record_filter === "other_languages") {
      for (let i = inputRows.length - 1; i >= 0; i--) if (/^(普通话|汉语|中文|mandarin|chinese)$/i.test(String(inputRows[i].facts.name?.value ?? ""))) inputRows.splice(i, 1);
    }
    if (recipe2.family === "dayee" && isFawEditor(catalog.raw.url) && section === "\u6559\u80B2\u7ECF\u5386") {
      const levels = ["\u9AD8\u4E2D", "\u5927\u4E13", "\u672C\u79D1", "\u7855\u58EB\u7814\u7A76\u751F", "\u535A\u58EB\u7814\u7A76\u751F"];
      inputRows.sort((a, b) => levels.indexOf(String(b.facts.level?.value)) - levels.indexOf(String(a.facts.level?.value)));
    }
    const status = inputRows.length ? "provided" : rule.sources.every((s) => sources[s]?.presence === "none") ? "none" : "unknown";
    const fields2 = catalog.raw.fields.filter((f2) => f2.scope === section || f2.scope.startsWith(`${section} / \u7B2C`));
    const bankSlots = recipe2.family === "job51" && section === "\u6559\u80B2\u80CC\u666F" && fields2.some((f2) => f2.educationSlot);
    const levelSlots = bankSlots || recipe2.family === "job51" && section === "\u6559\u80B2\u7ECF\u5386" && fields2.some((f2) => f2.label === "\u6700\u9AD8\u5B66\u5386" && f2.scope === section) && (fields2.filter((f2) => !button(f2)).length === 1 || fields2.some((f2) => /^(博士|硕士|本科|大专)是否统招$/.test(f2.label)));
    if (levelSlots) {
      const selector = fields2.find((f2) => f2.label === "\u6700\u9AD8\u5B66\u5386"), binding = catalog.records.find((b) => b.scope === section && b.frame === selector.frame);
      const levels = ["\u9AD8\u4E2D", "\u5927\u4E13", "\u672C\u79D1", "\u7855\u58EB\u7814\u7A76\u751F", "\u535A\u58EB\u7814\u7A76\u751F"], rank = (r) => levels.indexOf(String(r.facts.level?.value));
      const highest = Math.max(...inputRows.map(rank)), rows = inputRows.filter((r) => rank(r) === highest);
      if (!binding || rows.length !== 1 || inputRows.some((r) => rank(r) < 0)) {
        addDisposition(selector, "highest_education_ambiguous");
        continue;
      }
      const fact2 = rows[0].facts.level, value = String(fact2.value).replace("\u7814\u7A76\u751F", "");
      if (!selector.options.includes(value) || nonempty(selector) && selector.value !== value) {
        addDisposition(selector, "highest_education_conflict");
        continue;
      }
      const rid = `r${plan.records.length}`, sid = `s${Object.keys(plan.facts).length}`;
      plan.facts[sid] = { ...fact2, value };
      plan.records.push({ id: rid, section, mode: "existing", binding: binding.binding, add_target: "\u6DFB\u52A0", steps: [{ id: sid, action: "select", field: selector.label, source_ref: sid, depends_on: [], overwrite: false, selection_mode: "replace", query_from_value: false, allow_custom: false }] });
      addDisposition(selector, "planned", rows[0].id);
      if (!nonempty(selector)) {
        reobserve_after_execution = true;
        continue;
      }
    }
    if (recipe2.family === "job51" && section === "\u6559\u80B2\u7ECF\u5386" && fields2.some((f2) => f2.label === "\u6700\u9AD8\u5B66\u5386") && inputRows.length > 1) {
      const levels = ["\u9AD8\u4E2D", "\u5927\u4E13", "\u672C\u79D1", "\u7855\u58EB\u7814\u7A76\u751F", "\u535A\u58EB\u7814\u7A76\u751F"];
      const rank = (row) => levels.indexOf(String(row.facts.level?.value));
      const highest = Math.max(...inputRows.map(rank));
      if (inputRows.some((row) => rank(row) < 0) || inputRows.filter((row) => rank(row) === highest).length !== 1) {
        source_dispositions.push({ section, status: "highest_education_ambiguous" });
        continue;
      }
      inputRows.sort((a, b) => rank(b) - rank(a));
    }
    const binders = catalog.records.filter((b) => b.section === section);
    const recordFields = (b) => fields2.filter((f2) => f2.frame === b.frame && f2.scope === b.scope && !button(f2) && !rule.negative?.includes(f2.label));
    const cards = binders.filter((b) => recordFields(b).length > 0 && (!levelSlots || b.scope !== section));
    const adds = fields2.filter((f2) => button(f2) && [section === "\u6559\u80B2\u7ECF\u5386" ? "\u6DFB\u52A0\u6559\u80B2\u7ECF\u5386" : `\u6DFB\u52A0${section}`, "\u6DFB\u52A0"].includes(f2.label));
    const addLabel = adds.length === 1 ? adds[0].label : void 0;
    const toggles = fields2.filter((f2) => rule.negative?.includes(f2.label) && f2.inputMode === "boolean");
    const dependencies = [];
    if (toggles.length === 1 && status !== "unknown") {
      const toggle = toggles[0], binder = binders.find((b) => b.scope === toggle.scope && b.frame === toggle.frame);
      if (binder) {
        const id3 = `r${plan.records.length}`, sid = `s${Object.keys(plan.facts).length}`, value = status === "none";
        const hasExisting = cards.some((b) => recordFields(b).some(nonempty));
        if (value && hasExisting) {
          addDisposition(toggle, "existing_records_conflict");
        } else if (toggle.checked !== value && hasExisting && !policy.overwrite_fields.some((p) => p.section === section && p.field === toggle.label)) {
          addDisposition(toggle, "overwrite_required");
        } else {
          plan.facts[sid] = { value, source: `profile:${profile.profile_id}@${profile.revision}/${value ? "section_status/" + rule.sources[0] : "experience"}` };
          plan.records.push({ id: id3, section, mode: "existing", binding: binder.binding, add_target: "\u6DFB\u52A0", steps: [{ id: sid, action: "fill", field: toggle.label, source_ref: sid, overwrite: toggle.checked !== value, depends_on: [] }] });
          dependencies.push(sid);
          addDisposition(toggle, "planned");
        }
      }
    }
    if (!inputRows.length) {
      const states = rule.sources.map((s) => preparationAnswerState(profile, s, s, "presence")).filter(Boolean);
      for (const field of fields2.filter((f2) => !button(f2) && !handled.has(keyOf(f2)))) addDisposition(field, nonempty(field) ? "preserved" : status === "none" ? "explicit_none" : states.length === rule.sources.length ? `user_${states[0]}` : "not_provided");
      continue;
    }
    const matches2 = (b, row) => {
      const anchors2 = rule.fields.filter((r) => row.anchors.includes(r.key) || r.key === "range" && row.anchors.includes("start"));
      const visible = anchors2.flatMap((r) => recordFields(b).filter((f2) => r.labels.some((l) => normalizeField(l) === normalizeField(f2.label)) && nonempty(f2)).map((f2) => ({ f: f2, r })));
      if (recipe2.family === "guopin" && section === "\u6559\u80B2\u7ECF\u5386" && !visible.length) {
        const level = recordFields(b).find((f2) => f2.label === "\u5B66\u5386");
        if (level && nonempty(level)) return level.value === String(row.facts.level?.value).replace("\u7814\u7A76\u751F", "") || level.value === row.facts.level?.value;
      }
      return visible.length > 0 && visible.every(({ f: f2, r }) => {
        const fact2 = fieldFact(row, r, f2);
        return fact2 && normalizeField(f2.value) === normalizeField(display(projectValue(r, fact2, recipe2)));
      });
    };
    for (const row of inputRows) {
      if (!rule.fields.some((r) => Boolean(factFor(row, r)))) continue;
      const available = cards.filter((b) => !consumed.has(b.binding));
      const matching = available.filter((b) => matches2(b, row));
      const ambiguous = matching.length > 1 || matching.some((b) => inputRows.filter((r) => matches2(b, r)).length !== 1);
      let binder = ambiguous ? void 0 : matching[0];
      if (!binder && !ambiguous) binder = available.find((b) => !recordFields(b).some(nonempty));
      if (levelSlots) {
        const level = String(row.facts.level?.value).replace("\u7814\u7A76\u751F", "");
        const nonSchool = inputRows.filter((r) => r.facts.level?.value !== "\u9AD8\u4E2D");
        const ranks = ["\u5927\u4E13", "\u672C\u79D1", "\u7855\u58EB\u7814\u7A76\u751F", "\u535A\u58EB\u7814\u7A76\u751F"];
        const highest = nonSchool.filter((r) => ranks.indexOf(String(r.facts.level?.value)) === Math.max(...nonSchool.map((r2) => ranks.indexOf(String(r2.facts.level?.value)))));
        const others = nonSchool.filter((r) => !highest.includes(r));
        const kind = level === "\u9AD8\u4E2D" ? "high_school" : highest.includes(row) ? "highest" : "other";
        if (bankSlots && kind === "other" && others.length !== 1) {
          source_dispositions.push({ section, record_id: row.id, status: "record_mapping_ambiguous" });
          continue;
        }
        const slots = cards.filter((b) => recordFields(b).some((f2) => bankSlots ? f2.educationSlot === kind : f2.label === `${level}\u662F\u5426\u7EDF\u62DB`));
        if (slots.length !== 1) {
          source_dispositions.push({ section, record_id: row.id, status: slots.length ? "record_mapping_ambiguous" : "record_level_not_available" });
          continue;
        }
        binder = slots[0];
      } else if (recipe2.family === "job51" && section === "\u6559\u80B2\u7ECF\u5386" && fields2.some((f2) => f2.label === "\u6700\u9AD8\u5B66\u5386")) {
        const slot = cards.find((b) => b.scope === `${section} / \u7B2C${inputRows.indexOf(row) + 1}\u6761`);
        if (!slot) {
          source_dispositions.push({ section, record_id: row.id, status: "record_unavailable" });
          continue;
        }
        if (consumed.has(slot.binding) || recordFields(slot).some(nonempty) && !matches2(slot, row)) {
          source_dispositions.push({ section, record_id: row.id, status: "record_mapping_ambiguous" });
          continue;
        }
        binder = slot;
      }
      if (!rule.repeated) binder = cards.length === 1 ? cards[0] : void 0;
      const unavailable = ambiguous || !rule.repeated && cards.length > 1;
      if (unavailable || !binder && rule.repeated && available.some((b) => recordFields(b).some(nonempty)) && policy.records !== "append" && !matching.length) {
        source_dispositions.push({ section, record_id: row.id, status: "record_mapping_ambiguous" });
        continue;
      }
      if (recipe2.family === "guopin" && !binder) {
        source_dispositions.push({ section, record_id: row.id, status: "editor_requires_open" });
        continue;
      }
      if (!binder && !addLabel && !dependencies.length) {
        source_dispositions.push({ section, record_id: row.id, status: fields2.some((f2) => !button(f2)) ? "record_unavailable" : "section_not_expandable" });
        continue;
      }
      if (binder) {
        consumed.add(binder.binding);
      }
      const rid = `r${plan.records.length}`;
      const target = { id: rid, section, mode: binder ? "existing" : rule.reveal ? "reveal" : "new", ...binder ? { binding: binder.binding } : {}, add_target: addLabel ?? "\u6DFB\u52A0", steps: [] };
      const separateDates = ["phoenix", "dayee", "job51"].includes(recipe2.family);
      const inferredRules = recipe2.family === "dayee" ? dayeeInferredRules(rule.fields, section, catalog.raw.url) : rule.fields;
      const actual = binder ? recordFields(binder) : cards[0] ? recordFields(cards[0]) : inferredRules.filter((r) => factFor(row, r) && !(!separateDates && ["start", "end", "current"].includes(r.key)) && !(separateDates && r.key === "range") && !(recipe2.family === "ud" && section === "\u6559\u80B2\u7ECF\u5386" && r.key === "degree") && !(recipe2.family === "ud" && section === "\u9879\u76EE\u7ECF\u5386" && ["description", "responsibilities"].includes(r.key))).map((r) => inferredField(r, section, recipe2));
      const template = actual.filter((f2) => !button(f2)).map((field) => binder ? field : { ...field, index: -1, value: "", checked: field.checked === null ? null : false, pendingInput: false });
      if (recipe2.family === "dayee" && /^https:\/\/faw-zhaopin\.hotjob\.cn\//.test(catalog.raw.url)) {
        for (const field of template) if (field.inputMode === "date" && /^(开始时间|结束时间|出生日期|考试时间)$/.test(field.label)) field.datePrecision = "date";
      }
      const educationGate = recipe2.family === "guopin" && section === "\u6559\u80B2\u7ECF\u5386" && template.find((f2) => ["\u5B66\u5386", "\u5B66\u4F4D\u8BC1"].includes(f2.label) && !nonempty(f2) && Boolean(factFor(row, { key: f2.label === "\u5B66\u5386" ? "level" : "has_degree", labels: [] })));
      const usedKeys = /* @__PURE__ */ new Set();
      for (const field of template) {
        if (educationGate && field !== educationGate) {
          addDisposition(field, "awaiting_education_level", row.id);
          continue;
        }
        if (field.role === "button" || rule.negative?.includes(field.label)) continue;
        const manual2 = manualReason(field);
        if (manual2) {
          addDisposition({ ...field, scope: binder?.scope ?? `${section} / \u65B0\u8BB0\u5F55` }, `manual_${manual2}`, row.id);
          if (binder) plan.protected_fields.push({ record_id: rid, field: field.label });
          continue;
        }
        if (template.some((parent2) => parent2.relatedFields?.includes(field.label))) {
          addDisposition({ ...field, scope: binder?.scope ?? `${section} / \u65B0\u8BB0\u5F55` }, "composite_member", row.id);
          continue;
        }
        if (template.some((parent2) => parent2.role === "date-group" && field.label.startsWith(`${parent2.label} / `))) {
          addDisposition({ ...field, scope: binder?.scope ?? `${section} / \u65B0\u8BB0\u5F55` }, "date_group_member", row.id);
          continue;
        }
        const semanticLabel = levelSlots ? field.label.replace(/^(博士|硕士|本科|大专)/, "") : field.label;
        const eligible = recipe2.family === "dayee" ? dayeeFieldRules(fieldRules(rule, semanticLabel, company), catalog.raw.url) : fieldRules(rule, semanticLabel, company);
        const specific = eligible.filter((r) => r.company === company && r.company);
        const candidates = specific.length ? specific : eligible;
        const fieldRule = candidates.length === 1 ? candidates[0] : void 0;
        const fact2 = fieldRule && fieldFact(row, fieldRule, field);
        if (fieldRule && fact2) {
          usedSources.add(`${row.id}:${fieldRule.key}`);
          if (fieldRule.key === "combined_description") for (const k of ["description", "responsibilities"]) usedSources.add(`${row.id}:${k}`);
        }
        const scope = binder?.scope ?? `${section} / \u65B0\u8BB0\u5F55`;
        const targetField = { ...field, scope, ...!binder ? { index: -1 } : {} };
        if (binder && (field.disabled || identity.test(field.label) && nonempty(field))) {
          plan.protected_fields.push({ record_id: rid, field: field.label });
          addDisposition(targetField, "protected", row.id);
          continue;
        }
        const unresolved = (status2) => {
          addDisposition(targetField, status2, row.id);
          plan.unresolved.push({ record_id: rid, field: field.label, status: status2 === "missing_information" ? "missing_information" : "needs_judgment", reason: status2 });
        };
        if (!fieldRule) {
          if (!candidates.length && nonempty(field)) {
            addDisposition(targetField, "preserved", row.id);
            continue;
          }
          unresolved(candidates.length ? "field_mapping_ambiguous" : "unmapped_field");
          continue;
        }
        if (fieldRule.key === "end" && row.facts.current?.value === true) {
          addDisposition(targetField, "current_record", row.id);
          continue;
        }
        if (!fact2) {
          const marked = preparationAnswerState(profile, fieldRule.key === "cities" ? "intent" : row.section ?? rule.sources[0], fieldRule.key === "cities" ? "intent" : row.id, fieldRule.key);
          if (nonempty(field)) addDisposition(targetField, "preserved", row.id);
          else if (field.required) unresolved(marked ? `user_${marked}` : "missing_information");
          else addDisposition(targetField, marked ? `user_${marked}` : "not_provided", row.id);
          continue;
        }
        if (template.filter((f2) => normalizeField(f2.label) === normalizeField(field.label)).length > 1) {
          unresolved("field_mapping_ambiguous");
          continue;
        }
        if (conflictingSource(fact2)) {
          unresolved("source_conflict");
          continue;
        }
        if (field.pendingInput) {
          unresolved("uncommitted_value");
          continue;
        }
        let value = projectValue(fieldRule, fact2, recipe2);
        if (recipe2.family === "dayee" && isFawEditor(catalog.raw.url)) value = fawOption(fieldRule.key, value);
        if (fieldRule.key === "english_test_type" && typeof value === "string" && field.options.length && !field.options.includes(value)) {
          const punctuation = (v) => v.replaceAll("\uFF08", "(").replaceAll("\uFF09", ")");
          const equivalent = field.options.filter((option) => punctuation(option) === punctuation(value));
          if (equivalent.length === 1) value = equivalent[0];
        }
        if (["job51", "dayee"].includes(recipe2.family) && fieldRule.key.endsWith("_province") && typeof value === "string" && field.options.length && !field.options.includes(value)) {
          const sourceProvince = value.replace(/省$/, "");
          const equivalent = field.options.filter((option) => option.replace(/省$/, "") === sourceProvince);
          if (equivalent.length === 1) value = equivalent[0];
        }
        if (field.datePrecision === "date" && typeof value === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          unresolved("date_precision_required");
          continue;
        }
        if (recipe2.family === "job51" && fieldRule.key === "birth_date" && field.role === "date-group" && typeof value === "string") value = value.slice(0, 7);
        if (field.constraints.maxlength !== null && display(value).length > field.constraints.maxlength) {
          unresolved("length_limit");
          continue;
        }
        let action = recipe2.family === "guopin" && fieldRule.key.endsWith("_path") && Array.isArray(value) ? "path" : field.inputMode === "date" ? "date" : field.inputMode === "choice" ? "select" : "fill";
        const parent = parentLabel(field.label), upstream = parent && target.steps.find((step) => step.field === parent);
        if (action === "select" && ["level", "highest_education"].includes(fieldRule.key) && typeof value === "string" && !field.options.includes(value)) {
          const equivalent = { "\u7855\u58EB\u7814\u7A76\u751F": "\u7855\u58EB", "\u535A\u58EB\u7814\u7A76\u751F": "\u535A\u58EB", "\u7855\u58EB": "\u7855\u58EB\u7814\u7A76\u751F", "\u535A\u58EB": "\u535A\u58EB\u7814\u7A76\u751F" }[value];
          if (equivalent && field.options.includes(equivalent)) value = equivalent;
        }
        if (fieldRule.key === "current" && template.some((f2) => f2.role === "date-group")) {
          addDisposition(targetField, "date_group_member", row.id);
          continue;
        }
        if (action === "fill" && typeof value === "object" || action === "date" && !(typeof value === "string" || typeof value === "object" && !Array.isArray(value))) {
          unresolved("control_type_changed");
          continue;
        }
        if (action === "select" && field.options.length && typeof value === "string" && !field.options.includes(value) && !upstream) {
          unresolved("no_equivalent_option");
          continue;
        }
        const overwrite = policy.overwrite_fields.some((p) => p.section === section && p.field === field.label) || Boolean(upstream && !nonempty(field));
        if (binder && nonempty(field) && (typeof value === "boolean" ? value !== field.checked : display(value) !== field.value) && !(recipe2.family === "guopin" && field.label === "\u671F\u671B\u884C\u4E1A" && fieldRule.key === "industry_path" && Array.isArray(value) && field.value === value.at(-1)) && !(recipe2.family === "guopin" && fieldRule.key === "guopin_certificate_paths" && Array.isArray(value) && field.value.split(" / ").every((v) => value.some((path) => path.split(" / ").at(-1) === v))) && !overwrite) {
          unresolved("existing_value_conflict");
          continue;
        }
        const sid = `s${Object.keys(plan.facts).length}`;
        plan.facts[sid] = { value, source: fact2.source };
        target.steps.push({ id: sid, field: field.label, action, source_ref: sid, overwrite, depends_on: [...dependencies, ...upstream ? [upstream.id] : []], ...action === "select" ? { selection_mode: "replace", query_from_value: fieldRule.custom === true || fieldRule.key === "school" || recipe2.family === "guopin" && fieldRule.key === "major", allow_custom: fieldRule.custom === true } : {} });
        usedKeys.add(fieldRule.key);
        addDisposition(targetField, "planned", row.id);
        usedSources.add(`${row.id}:${fieldRule.key}`);
      }
      if (educationGate && target.steps.length) {
        reobserve_after_execution = true;
        for (const field of template.filter((f2) => !nonempty(f2) && ["\u7EDF\u62DB", "\u5168\u65E5\u5236", "\u5B66\u4F4D\u8BC1", "\u5B66\u4F4D\u7EC6\u5206", "\u4E13\u4E1A\u5206\u7C7B", "\u4E13\u4E1A\u540D\u79F0", "\u4E13\u4E1A\u6392\u540D", "\u5B66\u5386\u8BC1\u4E66\u7F16\u53F7", "\u5B66\u4F4D\u8BC1\u4E66\u7F16\u53F7"].includes(f2.label))) dynamicEffects.push({ source_step: target.steps[0].id, target_record: rid, field: field.label, remove_empty: true });
      }
      for (const parent of [...target.steps]) {
        const original = template.find((f2) => f2.label === parent.field);
        if (!original || display(plan.facts[parent.source_ref].value) === original.value) continue;
        const children = template.filter((f2) => parentLabel(f2.label) === parent.field);
        if (children.some((child) => nonempty(child) && !target.steps.some((step) => step.field === child.label))) {
          target.steps = target.steps.filter((step) => step !== parent);
          plan.unresolved.push({ record_id: rid, field: parent.field, status: "needs_judgment", reason: "dependent_value_conflict" });
          for (const d of dispositions) if (d.source_record === row.id && d.field === parent.field && d.status === "planned") d.status = "dependent_value_conflict";
        }
      }
      const current = target.steps.find((s) => s.field === "\u81F3\u4ECA");
      if (current) {
        target.steps = target.steps.filter((s) => s !== current);
        target.steps.unshift(current);
        for (const step of target.steps) if (step !== current && step.action === "date") step.depends_on.push(current.id);
      }
      if (target.steps.length || binder) {
        plan.records.push(target);
        record_sources.push({ plan_record: rid, source_section: row.section ?? rule.sources[0], source_record: row.id });
      } else {
        plan.unresolved = plan.unresolved.filter((u) => u.record_id !== rid);
        plan.protected_fields = plan.protected_fields.filter((u) => u.record_id !== rid);
        source_dispositions.push({ section, record_id: row.id, status: "no_executable_facts" });
      }
    }
  }
  for (const patch of policy.bindings) {
    const fields2 = catalog.raw.fields.filter((f2) => f2.scope === patch.scope && f2.label === patch.field && !button(f2));
    if (manualReason({ label: patch.field, scope: patch.scope }) || fields2.some((f2) => manualReason(f2))) continue;
    const facts = Object.values(sources).flatMap((s) => s.records).flatMap((r) => Object.values(r.facts)).filter((f2) => f2.source === `profile:${profile.profile_id}@${profile.revision}/${patch.source_ref}`);
    const binders = catalog.records.filter((b) => b.scope === patch.scope);
    if (fields2.length !== 1 || facts.length !== 1 || binders.length !== 1) {
      dispositions.push({ scope: patch.scope, field: patch.field, status: "exception_binding_ambiguous" });
      continue;
    }
    const field = fields2[0], fact2 = facts[0], binder = binders[0];
    let target = plan.records.find((r) => r.binding === binder.binding);
    if (target?.steps.some((s) => s.field === field.label) || field.disabled || identity.test(field.label) && nonempty(field)) {
      addDisposition(field, "exception_binding_conflict");
      continue;
    }
    const overwrite = policy.overwrite_fields.some((p) => p.section === binder.section && p.field === field.label);
    if (nonempty(field) && display(fact2.value) !== field.value && !overwrite) {
      addDisposition(field, "existing_value_conflict");
      continue;
    }
    if (conflictingSource(fact2)) {
      addDisposition(field, "source_conflict");
      continue;
    }
    if (field.pendingInput || field.constraints.maxlength !== null && display(fact2.value).length > field.constraints.maxlength) {
      addDisposition(field, "exception_constraints");
      continue;
    }
    if (!target) {
      target = { id: `r${plan.records.length}`, section: binder.section, mode: "existing", binding: binder.binding, add_target: "\u6DFB\u52A0", steps: [] };
      plan.records.push(target);
    }
    const sid = `s${Object.keys(plan.facts).length}`;
    const action = field.inputMode === "date" ? "date" : field.inputMode === "choice" ? "select" : "fill";
    plan.facts[sid] = fact2;
    target.steps.push({ id: sid, field: field.label, action, source_ref: sid, overwrite, depends_on: [], ...action === "select" ? { selection_mode: "replace", query_from_value: false, allow_custom: false } : {} });
    plan.unresolved = plan.unresolved.filter((u) => !(u.record_id === target.id && u.field === field.label));
    for (let i = dispositions.length - 1; i >= 0; i--) if (dispositions[i].scope === field.scope && dispositions[i].field === field.label) dispositions.splice(i, 1);
    addDisposition(field, "planned");
  }
  for (const [source, section] of Object.entries(sources)) for (const row of section.records) {
    if (!Object.keys(row.facts).length) continue;
    if (!recipe2.sections.some((r) => r.sources.includes(source) && r.sections.some((s) => allSections.includes(s)))) source_dispositions.push({ section: source, record_id: row.id, status: ["skills", "custom_answers", "supplemental_fields"].includes(source) ? "requires_mapping" : "no_page_section" });
    else for (const k of Object.keys(row.facts)) if (!usedSources.has(`${row.id}:${k}`) && !["range", "start", "end", "current"].includes(k)) source_dispositions.push({ section: source, record_id: row.id, field: k, status: "no_mapped_page_field" });
  }
  for (const f2 of catalog.raw.fields.filter((f3) => !button(f3) && !handled.has(keyOf(f3)))) {
    const manual2 = manualReason(f2);
    addDisposition(f2, manual2 ? `manual_${manual2}` : f2.plannerFamily ? "unmapped_field" : "outside_resume");
  }
  for (let i = source_dispositions.length - 1; i >= 0; i--) {
    const d = source_dispositions[i];
    if ((d.section === "supplemental_fields" || policy.bindings.some((b) => b.source_ref === `${d.section}/${d.record_id}`)) && plan.records.some((r) => r.steps.some((s) => plan.facts[s.source_ref]?.source === `profile:${profile.profile_id}@${profile.revision}/${d.section}/${d.record_id}`))) source_dispositions.splice(i, 1);
  }
  if (!plan.records.length) return { manual_tasks, recipe: recipe2.id, plan: null, dispositions, source_dispositions, sections, module_selection: moduleSelection(recipe2, catalog, sections, dispositions, manual_tasks, null) };
  const derived_effects = [...dynamicEffects];
  if (recipe2.family === "dayee" && isFawEditor(catalog.raw.url)) {
    const basic3 = plan.records.find((r) => r.section === "\u4E2A\u4EBA\u57FA\u672C\u4FE1\u606F");
    const education3 = plan.records.find((r) => r.section === "\u6559\u80B2\u7ECF\u5386" && catalog.records.some((b) => b.binding === r.binding && b.scope === "\u6559\u80B2\u7ECF\u5386 / \u7B2C1\u6761"));
    if (basic3 && education3) for (const [from, to] of [["\u5B66\u5386", "\u5B66\u5386"], ["\u6700\u9AD8\u5B66\u5386\u6BD5\u4E1A\u9662\u6821", "\u5B66\u6821"], ["\u6700\u9AD8\u5B66\u5386\u4E13\u4E1A", "\u4E13\u4E1A\uFF08\u9AD8\u4E2D\u548C\u521D\u4E2D\u5B66\u5386\u4E13\u4E1A\u9009\u62E9\u201C\u5176\u4ED6\u201D\uFF09"], ["\u6BD5\u4E1A\u65F6\u95F4(\u4E0E\u6BD5\u4E1A\u8BC1\u4E00\u81F4)", "\u7ED3\u675F\u65F6\u95F4"]]) {
      const source = basic3.steps.find((s) => s.field === from), target = education3.steps.find((s) => s.field === to);
      if (source && target && display(plan.facts[source.source_ref].value) === display(plan.facts[target.source_ref].value)) derived_effects.push({ source_step: source.id, value_step: target.id, target_record: education3.id, field: to, planned_target: true });
    }
    const document2 = basic3?.steps.find((s) => s.field === "\u8BC1\u4EF6\u53F7\u7801");
    if (basic3 && document2) for (const field of ["\u6027\u522B", "\u51FA\u751F\u65E5\u671F"]) {
      const target = basic3.steps.find((s) => s.field === field);
      if (target) derived_effects.push({ source_step: document2.id, value_step: target.id, target_record: basic3.id, field, planned_target: true });
    }
  }
  if (recipe2.family === "sd") for (const derived of [
    { field: "\u6700\u9AD8\u5B66\u5386", sourceSection: "\u6559\u80B2\u80CC\u666F", sourceField: "\u5B66\u5386", explicit: profile.basic.highest_education },
    { field: "\u6700\u8FD1\u516C\u53F8", sourceSection: "\u5DE5\u4F5C\u7ECF\u5386", sourceField: "\u516C\u53F8\u540D\u79F0", explicit: profile.basic.recent_company }
  ]) {
    if (derived.explicit) continue;
    const target = plan.records.find((r) => r.mode === "existing" && r.section === "\u4E2A\u4EBA\u4FE1\u606F");
    const binder = target && catalog.records.find((b) => b.binding === target.binding);
    const fields2 = binder ? catalog.raw.fields.filter((f2) => f2.scope === binder.scope && f2.frame === binder.frame && f2.label === derived.field) : [];
    if (target && fields2.length === 1 && !target.steps.some((s) => s.field === derived.field)) {
      const effects = [];
      for (const record2 of plan.records.filter((r) => r.section === derived.sourceSection)) {
        const valueStep = record2.steps.find((s) => s.field === derived.sourceField);
        if (!valueStep) continue;
        for (const step of record2.steps) effects.push({ source_step: step.id, value_step: valueStep.id, target_record: target.id, field: derived.field });
      }
      if (effects.length) {
        derived_effects.push(...effects);
        plan.protected_fields = plan.protected_fields.filter((p) => p.record_id !== target.id || p.field !== derived.field);
        for (const d of dispositions) if (d.scope === binder.scope && d.field === derived.field) d.status = "site_derived";
      }
    }
  }
  const validation = validateFormPlan(plan);
  if (!validation.ok) throw new Error(`invalid_compilation:${validation.issues.map((i) => i.code).join(",")}`);
  return { record_sources, manual_tasks, recipe: recipe2.id, plan: validation.plan, dispositions, source_dispositions, sections, module_selection: moduleSelection(recipe2, catalog, sections, dispositions, manual_tasks, validation.plan), derived_effects, ...reobserve_after_execution ? { reobserve_after_execution: true } : {} };
}

// src/browser/planning/prepared-plans.ts
import { createHash as createHash5, randomUUID as randomUUID4 } from "node:crypto";
function catalogDigest(raw) {
  return createHash5("sha256").update(JSON.stringify({ sections: raw.sections, records: raw.records, attachments: raw.attachments, fields: raw.fields.map((f2) => ({ frame: f2.frame, scope: f2.scope, label: f2.label, policyContext: f2.policyContext, choiceGroup: f2.choiceGroup, tag: f2.tag, role: f2.role, type: f2.type, value: f2.value, checked: f2.checked, pendingInput: f2.pendingInput, datePrecision: f2.datePrecision, relatedFields: f2.relatedFields, required: f2.required, disabled: f2.disabled, readonly: f2.readonly, inputMode: f2.inputMode, options: f2.options, constraints: f2.constraints })) })).digest("hex");
}
var PreparedPlans = class {
  constructor(clock = Date.now) {
    this.clock = clock;
  }
  clock;
  entries = /* @__PURE__ */ new Map();
  prune() {
    for (const [id3, p] of this.entries) if (this.clock() - p.created >= 6e5) this.entries.delete(id3);
  }
  put(owner, profileId, revision, raw, compilation) {
    this.prune();
    if (!compilation.plan) throw new Error("no_executable_plan");
    if (this.entries.size >= 8) throw new Error("prepared_capacity_exceeded");
    if (Buffer.byteLength(JSON.stringify([...this.entries.values(), compilation])) > 4194304) throw new Error("prepared_capacity_exceeded");
    const entry = { id: randomUUID4(), owner, profileId, revision, created: this.clock(), digest: catalogDigest(raw), compilation, plan: compilation.plan };
    this.entries.set(entry.id, entry);
    return entry;
  }
  get(owner, id3) {
    this.prune();
    const entry = this.entries.get(id3);
    if (!entry) throw new Error("prepared_plan_expired");
    if (entry.owner !== owner) throw new Error("prepared_plan_access_denied");
    return entry;
  }
  clearOwner(owner) {
    for (const [id3, p] of this.entries) if (p.owner === owner) this.entries.delete(id3);
  }
  clear() {
    this.entries.clear();
  }
};
function preparationSummary(compilation, offset = 0, limit = 20) {
  const exceptions = [...compilation.dispositions.filter((d) => !["planned", "date_group_member", "composite_member", "protected", "preserved", "not_provided", "explicit_none", "outside_resume", "current_record", "site_derived"].includes(d.status)), ...compilation.source_dispositions];
  const counts = {};
  for (const d of compilation.dispositions) counts[d.status] = (counts[d.status] ?? 0) + 1;
  const profile_only_sections = [...new Set(compilation.source_dispositions.filter((d) => d.status === "no_page_section").map((d) => d.section))];
  const result = { recipe: compilation.recipe, manual_tasks: compilation.manual_tasks.slice(0, 20), manual_task_count: compilation.manual_tasks.length, manual_handling: "fill_ordinary_then_report", ...compilation.reobserve_after_execution ? { next_action: "reprepare_after_verified_execution" } : {}, planned_records: compilation.plan?.records.length ?? 0, deferred_steps: compilation.plan?.records.filter((r) => r.mode !== "existing").reduce((n, r) => n + r.steps.length, 0) ?? 0, planned_steps: compilation.plan?.records.reduce((n, r) => n + r.steps.length, 0) ?? 0, page_module_count: compilation.module_selection.length, planned_module_count: compilation.module_selection.filter((module) => module.decision === "planned").length, module_selection: compilation.module_selection, profile_only_sections, sections: compilation.sections, dispositions: counts, differences: exceptions.slice(offset, offset + limit), difference_count: exceptions.length, next_offset: offset + limit < exceptions.length ? offset + limit : null };
  while (result.differences.length > 1 && Buffer.byteLength(JSON.stringify(result)) > 12e3) result.differences.pop();
  result.next_offset = offset + result.differences.length < exceptions.length ? offset + result.differences.length : null;
  return result;
}

// src/browser/low-level-policy.ts
var describe = new Function("element", `if(!element.isConnected)throw new Error('target_detached_before_policy');return (${createDomFormRuntime.toString()})().describe(element);`);
var focused = new Function(`const element=document.activeElement;return element&&element!==document.body ? (${createDomFormRuntime.toString()})().describe(element) : null;`);
var inputs = /* @__PURE__ */ new Set(["fill", "fill_form", "click", "type_text", "press_key", "drag", "click_at", "upload_file", "evaluate_script"]);
async function guardLowLevelAction(name, params, page) {
  if (!inputs.has(name)) return;
  const fixture = fixtureDiagnosticsAllowed(page.pptrPage.url());
  if (name === "evaluate_script") {
    if (!fixture) throw new Error("controlled_mode_script_disabled: use form_observe or take_snapshot");
    return;
  }
  if (name === "upload_file") {
    if (!fixture) throw new Error("manual_boundary: upload files in the dedicated browser");
    return;
  }
  if (["drag", "click_at"].includes(name)) throw new Error("unscoped_action_disabled: use semantic form tools");
  if (name === "press_key" && !/^(?:Backspace|Delete|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End|Escape|Tab|Shift\+Tab|Control\+A|Meta\+A)$/.test(params.key))
    throw new Error("unscoped_key_disabled: use semantic form tools");
  if (name === "type_text" && params.submitKey && !["Tab", "Escape"].includes(params.submitKey)) throw new Error("unscoped_key_disabled: use semantic form tools");
  const targets = [];
  if (name === "type_text" || name === "press_key") {
    const target = await page.pptrPage.evaluate(focused);
    if (!target && name === "press_key" && ["Tab", "Shift+Tab", "Escape"].includes(params.key)) return;
    if (!target) throw new Error("unscoped_action_disabled: focus a supported form control");
    targets.push(target);
  } else {
    const uids = name === "fill_form" ? params.elements?.map((e) => e.uid) : [params.uid];
    if (!uids?.length || uids.some((uid) => typeof uid !== "string")) throw new Error("unscoped_action_disabled");
    for (const uid of uids) {
      const deadline = Date.now() + 1500;
      for (; ; ) {
        const handle = await page.getElementByUid(uid);
        try {
          targets.push(await handle.evaluate(describe));
          break;
        } catch (error2) {
          if (!(error2 instanceof Error) || !error2.message.includes("target_detached_before_policy") || Date.now() >= deadline) throw error2;
        } finally {
          await handle.dispose();
        }
        await new Promise((resolve5) => setTimeout(resolve5, 50));
      }
    }
  }
  for (const target of targets) {
    if (manualReason(target)) throw new Error("manual_boundary: this field must be handled by the user");
    if (!target.label) throw new Error("unscoped_action_disabled: use semantic form tools");
    if (name === "click" && /^(下一步|下一页|保存|next|continue|save)$/i.test(target.label.replace(/\s/g, ""))) throw new Error("semantic_transition_required: use form_activate");
  }
}

// src/browser/page-presentation.ts
var reasons = /* @__PURE__ */ new Set(["user_request", "manual_action", "error", "completed"]);
var PagePresentation = class {
  constructor(clock = Date.now) {
    this.clock = clock;
  }
  clock;
  shown = /* @__PURE__ */ new Map();
  async run(tool, params, owner, handler) {
    if (tool !== "select_page" && tool !== "new_page") return handler(params);
    const adjusted = { ...params, ...tool === "new_page" ? { background: params.background ?? true } : { bringToFront: params.bringToFront ?? false } };
    const foreground = tool === "new_page" ? !adjusted.background : adjusted.bringToFront;
    if (!foreground) return handler(adjusted);
    if (!reasons.has(params.attention_reason)) throw new Error("attention_reason_required");
    if (params.attention_reason !== "user_request" && !params.attention_event_id) throw new Error("attention_event_id_required");
    for (const [key3, at] of this.shown) if (this.clock() - at > 18e5) this.shown.delete(key3);
    const key2 = JSON.stringify([owner, tool, params.pageId ?? params.url, params.attention_reason, params.attention_event_id]);
    const repeat = params.attention_reason !== "user_request" && this.shown.has(key2);
    if (repeat) {
      if (tool === "new_page") adjusted.background = true;
      else adjusted.bringToFront = false;
    }
    const result = await handler(adjusted);
    if (!repeat && !(result && typeof result === "object" && "isError" in result && result.isError)) {
      this.shown.set(key2, this.clock());
      while (this.shown.size > 256) this.shown.delete(this.shown.keys().next().value);
    }
    return result;
  }
  clearOwner(owner) {
    for (const key2 of this.shown.keys()) if (JSON.parse(key2)[0] === owner) this.shown.delete(key2);
  }
};

// src/browser/execution-report.ts
import { createHash as createHash6 } from "node:crypto";
var reportDetails = ["summary", "results", "module_records", "protected_fields", "unresolved", "manual_tasks", "unplanned_fields", "required_missing", "invalid_fields", "added_records", "unassigned_created_records", "uncertain_adds", "pages", "workflow_steps", "full"];
var array = (value) => Array.isArray(value) ? value : [];
function executionReport(data, options = {}) {
  if (!data.run_id && !data.journey_id) return data;
  const main = data.issue?.page_result ?? data.issue?.result ?? data, audit = main.page_audit ?? {};
  const manual2 = /* @__PURE__ */ new Map();
  const addManual = (tasks, pageIndex) => {
    for (const task of tasks) {
      const item = { ...task, ...pageIndex !== void 0 ? { page_index: pageIndex } : {} };
      manual2.set(JSON.stringify([pageIndex, task.frame, task.scope, task.field, task.reason]), item);
    }
  };
  for (const page of array(data.pages)) addManual(array(page.manual_tasks), page.index);
  addManual(array(audit.manual_tasks), data.current_index);
  addManual(array(data.issue?.tasks), data.current_index);
  addManual(array(data.issue?.manual_tasks), data.current_index);
  const pages = array(data.pages).map(({ manual_tasks, ...page }) => page);
  const collections = {
    results: array(main.results),
    protected_fields: array(main.protected_fields),
    unresolved: array(main.unresolved),
    manual_tasks: [...manual2.values()],
    unplanned_fields: array(audit.unplanned_fields),
    required_missing: array(audit.required_missing),
    invalid_fields: array(audit.invalid_fields),
    added_records: array(main.added_records),
    unassigned_created_records: array(main.unassigned_created_records),
    uncertain_adds: array(main.uncertain_adds),
    pages,
    module_records: array(data.records),
    workflow_steps: array(data.steps).map((step, index) => ({ index, step }))
  };
  const collection_counts = Object.fromEntries(Object.entries(collections).map(([key2, rows]) => [key2, rows.length]));
  const report_id = createHash6("sha256").update(JSON.stringify({ id: data.run_id ?? data.journey_id, status: data.status, error: data.error, issue: data.issue?.code, counts: main.counts, collections })).digest("hex").slice(0, 24);
  const detail = options.detail ?? "summary", offset = Math.max(0, options.offset ?? 0), limit = Math.min(50, Math.max(1, options.limit ?? 20));
  if (options.expected_report_id && options.expected_report_id !== report_id) return { ok: false, error: { code: "report_changed", message: "\u6267\u884C\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5148\u8BFB\u53D6\u6700\u65B0\u6458\u8981\uFF0C\u518D\u6309\u65B0 report_id \u7EE7\u7EED\u8BFB\u53D6\u8BE6\u60C5\u3002" }, run_id: data.run_id, journey_id: data.journey_id, report_id };
  if (detail === "full") return { ...data, report_id, detail: "full" };
  const out = { ...data, report_id, detail, detail_scope: data.journey_id ? "current_page_and_journey_manual_tasks" : "run", collection_counts };
  for (const key2 of ["results", "records", "protected_fields", "unresolved", "added_records", "unassigned_created_records", "uncertain_adds", "steps", "page_audit"]) delete out[key2];
  if (data.pages) out.pages = pages;
  if (data.issue) {
    out.issue = { ...data.issue };
    delete out.issue.page_result;
    delete out.issue.result;
    delete out.issue.tasks;
    delete out.issue.manual_tasks;
    if (main !== data && main.error) out.issue.execution_error = main.error;
  }
  if (main.counts) out.counts = main.counts;
  if (main.page_audit) out.page_audit = {
    visible_fields: audit.visible_fields,
    covered_fields: audit.covered_fields,
    page_error_count: audit.page_error_count,
    unplanned_field_count: collections.unplanned_fields.length,
    required_missing_count: collections.required_missing.length,
    invalid_field_count: collections.invalid_fields.length,
    manual_task_count: collections.manual_tasks.length
  };
  out.outcomes = {
    verified_ui: main.counts?.verified_ui ?? 0,
    preserved: main.counts?.preserved ?? 0,
    not_exposed: main.counts?.not_exposed ?? 0,
    protected_unchanged: collections.protected_fields.filter((row) => row.verification === "unchanged_ui").length,
    missing_information: collections.unresolved.filter((row) => row.status === "missing_information").length,
    unsupported: collections.unresolved.filter((row) => /unmapped|unsupported/.test(row.reason ?? "")).length,
    manual_pending: collections.manual_tasks.filter((row) => row.state !== "already_present").length,
    manual_already_present: collections.manual_tasks.filter((row) => row.state === "already_present").length,
    failed: main.counts?.failed ?? 0,
    uncertain: (main.counts?.unknown ?? 0) + collections.uncertain_adds.length,
    saved_preview_verified: collections.module_records.filter((row) => row.status === "saved_preview_verified").length,
    existing_records_preserved: collections.module_records.filter((row) => row.status === "existing_record_preserved").length
  };
  if (detail !== "summary") {
    const rows = collections[detail] ?? [];
    out.items = rows.slice(offset, offset + limit);
    out.total = rows.length;
    out.offset = offset;
    while (out.items.length > 1 && Buffer.byteLength(JSON.stringify(out)) > 16e3) out.items.pop();
    out.next_offset = offset + out.items.length < rows.length ? offset + out.items.length : null;
    return out;
  }
  const exceptions = [
    ...collections.results.filter((row) => !["verified_ui", "preserved", "not_exposed", "pending"].includes(row.status)).map((item) => ({ category: "execution", ...item })),
    ...collections.manual_tasks.filter((row) => row.state !== "already_present").map((item) => ({ category: "manual", ...item })),
    ...collections.unresolved.filter((row) => row.status !== "keep_existing").map((item) => ({ category: "unresolved", ...item })),
    ...collections.invalid_fields.map((item) => ({ category: "invalid", ...item })),
    ...collections.required_missing.map((item) => ({ category: "required_missing", ...item }))
  ];
  out.exceptions = exceptions.slice(0, Math.min(limit, 20));
  out.exception_count = exceptions.length;
  while (out.exceptions.length > 1 && Buffer.byteLength(JSON.stringify(out)) > 16e3) out.exceptions.pop();
  while (out.pages?.length > 1 && Buffer.byteLength(JSON.stringify(out)) > 16e3) out.pages.pop();
  out.returned_exception_count = out.exceptions.length;
  out.details_hint = "Use action=status with detail, offset, limit and expected_report_id. Counts cover full collections; exceptions can describe the same field from different checks.";
  return out;
}

// src/browser/form-journey.ts
import { createHash as createHash10, randomUUID as randomUUID7, timingSafeEqual as timingSafeEqual3 } from "node:crypto";

// src/browser/form-module-journey.ts
import { createHash as createHash9, randomUUID as randomUUID6, timingSafeEqual as timingSafeEqual2 } from "node:crypto";

// src/browser/manual-checkpoint.ts
import { createHash as createHash7 } from "node:crypto";
var digest = (fields2) => createHash7("sha256").update(JSON.stringify(fields2.map((f2) => [f2.tag, f2.type, f2.value, f2.checked]).sort())).digest("hex");
function manualCheckpoint(raw) {
  const ordinary = raw.fields.filter((f2) => f2.visible && f2.role !== "button" && f2.tag !== "button" && !manualReason(f2));
  const fields2 = [];
  for (const f2 of ordinary) {
    if (fields2.some((row) => row.frame === f2.frame && row.scope === f2.scope && row.field === f2.label)) continue;
    fields2.push({ frame: f2.frame, scope: f2.scope, field: f2.label, digest: digest(ordinary.filter((o) => o.frame === f2.frame && o.scope === f2.scope && o.label === f2.label)) });
  }
  return { fields: fields2 };
}
function verifyManualCheckpoint(checkpoint, raw) {
  return checkpoint.fields.every((f2) => digest(raw.fields.filter((o) => o.frame === f2.frame && o.scope === f2.scope && o.label === f2.field)) === f2.digest);
}

// src/browser/form-runner.ts
import { createHash as createHash8, randomUUID as randomUUID5, timingSafeEqual } from "node:crypto";
var retention = 30 * 6e4;
var now = () => Date.now();
var hash = (s) => createHash8("sha256").update(s).digest();
var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
var fieldValue = (f2) => f2.checked === null ? f2.value : f2.checked;
var fieldKey = (f2) => `${f2.frame}:${f2.label}`;
var matches = (field, value) => {
  if (field.pendingInput) return false;
  if (typeof value === "object" && value && !Array.isArray(value)) {
    const range2 = value;
    return same(field.value.split(/\s*\/\s*/), [range2.start, range2.current ? "\u81F3\u4ECA" : range2.end]);
  }
  if (Array.isArray(value)) return field.value === value.join(" / ") || same([...field.value.split(/\s*\/\s*/).filter(Boolean)].sort(), [...value].sort());
  return typeof value === "boolean" ? field.checked === value : field.value === String(value);
};
function fail(code) {
  throw new Error(code);
}
function codeOf(error2) {
  const text3 = error2 && typeof error2 === "object" && "code" in error2 ? String(error2.code) : error2 instanceof Error ? error2.message : String(error2);
  return /^[a-z][a-z0-9_]+$/.test(text3) ? text3 : "execution_failed";
}
var FormRunner = class {
  runs = /* @__PURE__ */ new Map();
  active;
  get activeId() {
    return this.active;
  }
  start(owner, requestId, input) {
    this.expire();
    const validation = validateFormPlan(input);
    if (!validation.ok) return { ok: false, error: { code: "invalid_plan", issues: validation.issues } };
    const replay = [...this.runs.values()].find((run2) => run2.requestId === requestId);
    if (replay && replay.owner !== owner) return { ok: false, error: { code: "run_access_denied" } };
    if (replay) return replay.digest === validation.digest ? { ...this.summary(replay), replayed: true } : { ok: false, error: { code: "request_id_conflict" } };
    if (this.active) return { ok: false, error: { code: "run_in_progress" } };
    if (this.runs.size >= 8) return { ok: false, error: { code: "run_capacity_exceeded" } };
    const id3 = randomUUID5(), secret = randomUUID5() + randomUUID5(), created = now();
    const run = {
      id: id3,
      owner,
      requestId,
      digest: validation.digest,
      secretHash: hash(secret),
      plan: validation.plan,
      status: "ready",
      created,
      deadline: created + validation.plan.budget_ms,
      expires: created + retention,
      updated: created,
      expectedValues: /* @__PURE__ */ new Map(),
      steps: /* @__PURE__ */ new Map(),
      records: /* @__PURE__ */ new Map(),
      controller: new AbortController(),
      windowActive: false,
      revision: 0,
      spawned: []
    };
    for (const record2 of run.plan.records) {
      run.records.set(record2.id, { added: false });
      for (const step of record2.steps) run.steps.set(step.id, { id: step.id, record_id: record2.id, field: step.field, status: "pending" });
    }
    this.runs.set(id3, run);
    this.active = id3;
    return { ...this.summary(run), resume_token: secret, created: true };
  }
  markPrepared(owner, id3) {
    this.authorize(owner, id3).automatic = true;
  }
  setDerivedEffects(owner, id3, effects) {
    this.authorize(owner, id3).derivedEffects = structuredClone(effects);
  }
  setGuard(owner, id3, guard) {
    this.authorize(owner, id3).guard = guard;
  }
  status(owner, id3, token) {
    this.expire();
    return this.summary(this.authorize(owner, id3, token));
  }
  cancel(owner, id3, token) {
    const run = this.authorize(owner, id3, token);
    this.stop(run, "operation_cancelled");
    return this.summary(run);
  }
  cancelOwner(owner) {
    for (const run of this.runs.values()) if (run.owner === owner) this.stop(run, "connection_closed");
  }
  cancelActive(reason = "lease_revoked") {
    const run = this.active && this.runs.get(this.active);
    if (run) this.stop(run, reason);
  }
  clear() {
    this.cancelActive("runtime_closed");
    this.runs.clear();
    this.active = void 0;
  }
  resume(owner, id3, token, revision) {
    this.expire();
    const run = this.authorize(owner, id3, token);
    if (run.windowActive || this.active && this.active !== id3) return { ok: false, error: { code: "run_in_progress" } };
    if (run.status === "expired") return this.summary(run);
    if (run.status === "completed") return this.summary(run);
    if (now() >= run.deadline) return { ok: false, error: { code: "run_budget_exhausted" }, run_id: id3 };
    if (revision) {
      const revised = structuredClone(run.plan);
      for (const [key2, fact2] of Object.entries(revision.facts ?? {})) {
        if (!revised.facts[key2]) fail("unknown_fact");
        const consumers = revised.records.flatMap((record2) => record2.steps).filter((step) => step.source_ref === key2);
        if (consumers.some((step) => run.steps.get(step.id)?.status === "verified_ui")) fail("verified_fact_immutable");
        revised.facts[key2] = fact2;
      }
      const checked = validateFormPlan(revised);
      if (!checked.ok) return { ok: false, error: { code: "invalid_revision", issues: checked.issues } };
      for (const id4 of revision.retry_steps ?? []) {
        const result = run.steps.get(id4);
        if (!result || result.status === "verified_ui" || result.status === "unknown") fail("invalid_retry_step");
        const record2 = run.records.get(result.record_id);
        if (record2.blocked) fail("record_requires_new_plan");
      }
      run.plan = checked.plan;
      run.revision++;
      for (const id4 of revision.retry_steps ?? []) Object.assign(run.steps.get(id4), { status: "pending", code: void 0 });
    }
    for (const result of run.steps.values()) if (result.status === "cancelled") result.status = "pending";
    run.owner = owner;
    run.controller = new AbortController();
    run.status = "ready";
    this.active = id3;
    return this.summary(run);
  }
  async executeWindow(owner, id3, engine, signal, windowMs = 9e4, progress) {
    const run = this.authorize(owner, id3);
    if (run.status !== "ready" || run.windowActive) return this.summary(run);
    run.windowActive = true;
    run.status = "working";
    run.updated = now();
    delete run.lastError;
    delete run.lastErrorTarget;
    delete run.audit;
    progress?.([...run.steps.values()].filter((s) => s.status !== "pending").length, run.steps.size);
    const windowEnd = Math.min(now() + windowMs, run.deadline);
    const abort = () => this.stop(run, "operation_cancelled");
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(() => this.stop(run, now() >= run.deadline ? "run_budget_exhausted" : "window_budget_exhausted"), Math.max(0, windowEnd - now()));
    try {
      let state = await engine.captureRun(run.plan.page_id, run.controller.signal);
      if (state.raw.authenticationRequired) throw new Error("authentication_required");
      engine.requireSupported?.(state.raw);
      this.assertDocument(run, state.navigationId);
      await run.guard?.(state.raw, !run.guardStarted);
      run.guardStarted = true;
      for (const record2 of run.plan.records) if (record2.mode === "existing") {
        const local = run.records.get(record2.id);
        local.binding ??= engine.getRunBinding(record2.binding, run.plan.page_id, run.plan.navigation_id, run.plan.observation_id);
        if (!local.binding || local.binding.section !== record2.section) fail("record_binding_expired");
        this.assertRecord(local.binding, state.raw);
      }
      records: for (const record2 of run.plan.records) {
        run.controller.signal.throwIfAborted();
        const local = run.records.get(record2.id);
        if (local.blocked || record2.steps.every((step) => run.steps.get(step.id).status !== "pending")) continue;
        if (windowEnd - now() < Math.min(3e4, windowMs / 2)) {
          run.status = "paused_window";
          break;
        }
        await run.guard?.(state.raw, false);
        const recordDeadline = Math.min(now() + (run.automatic ? Math.max(3e4, record2.steps.length * 3e3) : 3e4), windowEnd);
        if (!local.binding) {
          const external = record2.steps.flatMap((step) => step.depends_on).filter((dep) => run.steps.get(dep).record_id !== record2.id);
          if (external.some((dep) => run.steps.get(dep).status !== "verified_ui")) {
            local.blocked = "dependency_failed";
            this.blockRecord(run, record2, local.blocked);
            continue;
          }
          state = await engine.captureRun(run.plan.page_id, run.controller.signal);
          this.assertDocument(run, state.navigationId);
          this.assertProtected(run, state.raw);
          const spawned = run.spawned.filter((item) => !item.claimed && (external.includes(item.source) || run.automatic && item.source.startsWith("dayee_family_add:")) && item.binding.section === record2.section);
          if (record2.mode === "new" && spawned.length) {
            if (spawned.length !== 1) {
              local.blocked = "dependency_created_records_ambiguous";
              this.blockRecord(run, record2, local.blocked);
              continue;
            }
            const created = spawned[0];
            this.assertRecord(created.binding, state.raw);
            local.binding = created.binding;
            local.added = true;
            created.claimed = true;
          } else {
            const previous = new Set(state.raw.records?.map((r) => `${r.frame}:${r.identity}`));
            if (record2.mode === "reveal" && state.raw.fields.some((f2) => (f2.scope === record2.section || f2.scope.startsWith(`${record2.section} / `)) && f2.tag !== "button" && f2.role !== "button")) {
              local.blocked = "section_already_has_fields";
              this.blockRecord(run, record2, local.blocked);
              continue;
            }
            local.addAttempted = true;
            const result = await engine.activate({
              pageId: run.plan.page_id,
              scope: record2.section,
              target: record2.add_target,
              intent: record2.mode === "reveal" ? "open" : "add_record",
              operationId: `${run.id}:${record2.id}:add`,
              signal: run.controller.signal,
              testMode: run.plan.test_mode
            });
            const data = result.structuredContent;
            if (!data?.ok && data?.error?.side_effects === "none") {
              local.blocked = data?.error?.side_effects === "none" ? "add_failed" : "add_result_unknown";
              this.blockRecord(run, record2, local.blocked);
              continue;
            }
            state = await engine.captureRun(run.plan.page_id, run.controller.signal);
            this.assertDocument(run, state.navigationId);
            this.assertProtected(run, state.raw);
            const added = state.raw.records?.filter((r) => !previous.has(`${r.frame}:${r.identity}`) && r.scope.startsWith(`${record2.section} / `)) ?? [];
            if (record2.mode === "reveal" && !added.length) {
              const fields2 = state.raw.fields.filter((f2) => f2.scope === record2.section && f2.tag !== "button" && f2.role !== "button");
              const frames = new Set(fields2.map((f2) => f2.frame));
              if (!fields2.length || frames.size !== 1) {
                local.blocked = "add_result_unknown";
                this.blockRecord(run, record2, local.blocked);
                continue;
              }
              local.added = true;
              local.binding = {
                section: record2.section,
                scope: record2.section,
                frame: fields2[0].frame,
                pageId: run.plan.page_id,
                navigationId: state.navigationId,
                observationId: run.plan.observation_id,
                fields: structuredClone(fields2)
              };
            } else {
              const familyPair = run.automatic && record2.section === "\u5BB6\u5EAD\u5173\u7CFB" && data?.ok && data?.record_creation === "dayee_initial_family_pair" && added.length === 2 && added.every((r) => state.raw.fields.filter((f2) => f2.frame === r.frame && f2.scope === r.scope && f2.role !== "button").every((f2) => f2.plannerFamily === "dayee" && !f2.value && f2.checked !== true));
              if (added.length !== 1 && !familyPair) {
                local.blocked = "add_result_unknown";
                this.blockRecord(run, record2, local.blocked);
                continue;
              }
              if (familyPair) {
                const extra = added[1];
                run.spawned.push({ source: `dayee_family_add:${record2.id}`, claimed: false, binding: {
                  ...extra,
                  section: record2.section,
                  pageId: run.plan.page_id,
                  navigationId: state.navigationId,
                  observationId: run.plan.observation_id,
                  fields: structuredClone(state.raw.fields.filter((f2) => f2.scope === extra.scope && f2.frame === extra.frame && f2.role !== "button"))
                } });
              }
              const created = added[0];
              local.added = true;
              local.binding = {
                ...created,
                section: record2.section,
                pageId: run.plan.page_id,
                navigationId: state.navigationId,
                observationId: run.plan.observation_id,
                fields: structuredClone(state.raw.fields.filter((f2) => f2.scope === created.scope && f2.frame === created.frame && f2.tag !== "button" && f2.role !== "button"))
              };
            }
          }
        }
        let pending = record2.steps.filter((step) => run.steps.get(step.id).status === "pending");
        while (pending.length) {
          run.controller.signal.throwIfAborted();
          if (run.automatic && windowEnd - now() < Math.min(1e4, windowMs / 4)) {
            run.status = "paused_window";
            break records;
          }
          if (now() >= recordDeadline) {
            for (const step2 of pending) Object.assign(run.steps.get(step2.id), { status: "failed", code: "record_budget_exhausted" });
            break;
          }
          const step = pending.find((item) => item.depends_on.every((dep) => run.steps.get(dep).status !== "pending"));
          if (!step) fail("dependency_cycle");
          const result = run.steps.get(step.id);
          if (step.depends_on.some((dep) => {
            const outcome = run.steps.get(dep);
            if (outcome.status === "verified_ui") return false;
            const prerequisite = record2.steps.find((item) => item.id === dep);
            return !(run.automatic && record2.mode !== "existing" && outcome.status === "not_exposed" && prerequisite?.field === "\u81F3\u4ECA" && prerequisite.action === "fill" && run.plan.facts[prerequisite.source_ref]?.value === false);
          })) Object.assign(result, { status: "blocked", code: "dependency_failed" });
          else await this.executeStep(run, record2, step, engine, recordDeadline);
          run.updated = now();
          progress?.([...run.steps.values()].filter((s) => s.status !== "pending").length, run.steps.size);
          pending = record2.steps.filter((item) => run.steps.get(item.id).status === "pending");
        }
      }
      if (run.status === "working") {
        state = await engine.captureRun(run.plan.page_id, run.controller.signal);
        await run.guard?.(state.raw, false);
        if (state.raw.authenticationRequired) throw new Error("authentication_required");
        this.assertDocument(run, state.navigationId);
        this.assertProtected(run, state.raw);
        for (const effect of run.derivedEffects ?? []) {
          const binding = run.records.get(effect.target_record)?.binding;
          if (binding) this.assertRecord({ ...binding, fields: binding.fields.filter((f2) => f2.label === effect.field) }, state.raw);
        }
        for (const record2 of run.plan.records) for (const step of record2.steps) {
          const result = run.steps.get(step.id);
          if (result.status !== "verified_ui") continue;
          const binding = run.records.get(record2.id).binding;
          try {
            this.assertIdentity(binding, state.raw);
            const field = this.findField(binding, state.raw, step.field);
            if (!matches(field, run.expectedValues.get(step.id) ?? run.plan.facts[step.source_ref].value) || field.invalid) Object.assign(result, { status: "failed", code: "final_verification_failed" });
          } catch {
            Object.assign(result, { status: "failed", code: "final_binding_failed" });
          }
        }
        run.audit = this.audit(run, state.raw);
        run.status = [...run.steps.values()].every((s) => s.status === "verified_ui" || s.status === "not_exposed") && run.plan.records.filter((r) => run.records.get(r.id)?.added).every((r) => r.steps.some((s) => run.steps.get(s.id)?.status === "verified_ui")) && !run.plan.unresolved.some((item) => item.status !== "keep_existing") && !run.audit.required_missing.length && !run.audit.invalid_fields.length && !run.audit.page_error_count ? "completed" : "partial";
      }
    } catch (error2) {
      run.lastError = run.controller.signal.aborted ? String(run.controller.signal.reason?.message ?? "operation_cancelled") : codeOf(error2);
      if (error2 && typeof error2 === "object" && "scope" in error2 && "field" in error2) run.lastErrorTarget = { scope: String(error2.scope).slice(0, 240), field: String(error2.field).slice(0, 240) };
      run.status = run.controller.signal.aborted ? "cancelled" : "needs_input";
      for (const result of run.steps.values()) if (result.status === "pending" && run.controller.signal.aborted) result.status = "cancelled";
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      run.windowActive = false;
      run.updated = now();
      if (this.active === id3) this.active = void 0;
      if (run.status === "cancelling") run.status = "cancelled";
    }
    return this.summary(run);
  }
  async executeStep(run, record2, step, engine, deadline) {
    const result = run.steps.get(step.id);
    const binding = run.records.get(record2.id).binding;
    let state = await engine.captureRun(run.plan.page_id, run.controller.signal);
    if (state.raw.authenticationRequired) throw new Error("authentication_required");
    this.assertDocument(run, state.navigationId);
    this.assertRecord(binding, state.raw);
    this.assertProtected(run, state.raw);
    const value = run.plan.facts[step.source_ref].value;
    let field;
    try {
      field = this.findField(binding, state.raw, step.field);
    } catch {
      const absent = !state.raw.fields.some((f2) => f2.frame === binding.frame && f2.scope === binding.scope && f2.label === step.field);
      Object.assign(result, run.automatic && record2.mode !== "existing" && absent ? { status: "not_exposed", code: "page_field_absent" } : { status: "failed", code: "target_unresolved" });
      return;
    }
    if (run.automatic && record2.mode !== "existing" && typeof value === "string" && step.action !== "path") {
      const live = field.inputMode === "date" ? "date" : field.inputMode === "choice" ? "select" : "fill";
      if (live !== step.action) step = live === "select" ? { ...step, action: "select", selection_mode: "replace", query_from_value: false, allow_custom: false } : { ...step, action: live };
    }
    const additive = step.action === "select" && step.selection_mode === "add" && Array.isArray(value);
    let expected = additive ? [.../* @__PURE__ */ new Set([...field.value.split(/\s*\/\s*/).filter(Boolean), ...value])] : value;
    run.expectedValues.set(step.id, expected);
    if (matches(field, expected) && !field.invalid) {
      result.status = "verified_ui";
      return;
    }
    const verifyLeafPath = step.action === "path" && field.plannerFamily === "guopin" && field.label === "\u671F\u671B\u884C\u4E1A" && Array.isArray(value) && field.value === value.at(-1);
    const verifyCertificatePaths = step.action === "select" && field.plannerFamily === "guopin" && field.scope === "\u8D44\u683C\u8BC1\u4E66" && field.label === "\u8BC1\u4E66\u540D\u79F0" && Array.isArray(value);
    if (!step.overwrite && !additive && !verifyLeafPath && !verifyCertificatePaths && (field.checked === true || field.checked === null && field.value)) {
      result.status = "preserved";
      return;
    }
    if (field.disabled || field.readonly && step.action === "fill") {
      Object.assign(result, { status: "failed", code: "constraint_violation" });
      return;
    }
    const controller = new AbortController();
    const abort = () => controller.abort(run.controller.signal.reason);
    run.controller.signal.addEventListener("abort", abort, { once: true });
    if (run.controller.signal.aborted) abort();
    const timer = setTimeout(() => controller.abort(new Error("record_budget_exhausted")), Math.max(0, deadline - now()));
    const context = {
      pageId: run.plan.page_id,
      scope: binding.scope,
      operationId: `${run.id}:${step.id}:v${run.revision}`,
      signal: controller.signal,
      timeoutMs: Math.max(1, deadline - now()),
      overwrite: step.overwrite,
      testMode: run.plan.test_mode,
      cleanupOnFailure: true
    };
    try {
      const previousScopes = new Set(state.raw.records?.map((r) => `${r.frame}:${r.scope}`));
      let response;
      if (step.action === "fill" || step.action === "select" && field.inputMode === "choice_or_custom" && typeof value === "string") {
        response = await engine.fillFields({ ...context, fields: [{ field: step.field, scope: binding.scope, value, overwrite: step.overwrite }] });
      } else if (step.action === "select") {
        response = await engine.selectOption({
          ...context,
          field: step.field,
          value: typeof value === "string" ? value : "",
          ...step.query_from_value && typeof value === "string" ? { query: value } : {},
          allowCustom: step.allow_custom,
          ...Array.isArray(value) ? { values: value, selectionMode: step.selection_mode } : {}
        });
      } else if (step.action === "path") response = await engine.selectPath({ ...context, field: step.field, path: value });
      else response = await engine.setDate({
        ...context,
        field: step.field,
        value: typeof value === "string" ? value : "",
        ...typeof value === "object" && !Array.isArray(value) ? { range: {
          start: value.start,
          ...value.end !== void 0 ? { end: value.end } : {},
          ...value.current !== void 0 ? { current: value.current } : {}
        } } : {}
      });
      if (run.controller.signal.aborted) {
        Object.assign(result, { status: "unknown", code: "cancelled_after_dispatch" });
        run.controller.signal.throwIfAborted();
      }
      state = await engine.captureRun(run.plan.page_id, run.controller.signal);
      this.assertDocument(run, state.navigationId);
      this.assertIdentity(binding, state.raw);
      const after = this.findField(binding, state.raw, step.field);
      const proof = response.structuredContent;
      if (step.action === "path" && after.plannerFamily === "guopin" && after.label === "\u671F\u671B\u884C\u4E1A" && Array.isArray(value) && proof?.verification?.matched === true && same(proof.completed_path, value) && proof.readback_value === value.at(-1)) {
        expected = proof.readback_value;
        run.expectedValues.set(step.id, expected);
      }
      if (verifyCertificatePaths && Array.isArray(value) && proof?.verification?.matched === true && same(proof.completed_paths, value) && same(proof.readback_values, value.map((v) => v.split(" / ").at(-1)))) {
        expected = proof.readback_values;
        run.expectedValues.set(step.id, expected);
      }
      if (matches(after, expected) && !after.invalid) this.acceptDerivedEffect(run, step, state.raw);
      this.assertProtected(run, state.raw);
      for (const created of state.raw.records ?? []) if (!previousScopes.has(`${created.frame}:${created.scope}`)) {
        run.spawned.push({ source: step.id, claimed: false, binding: {
          ...created,
          section: created.scope.replace(/ \/ 第\d+条$/, ""),
          pageId: run.plan.page_id,
          navigationId: state.navigationId,
          observationId: run.plan.observation_id,
          fields: structuredClone(state.raw.fields.filter((f2) => f2.scope === created.scope && f2.frame === created.frame && f2.tag !== "button" && f2.role !== "button"))
        } });
      }
      const data = response.structuredContent;
      Object.assign(result, matches(after, expected) && !after.invalid ? { status: "verified_ui" } : { status: ["action_may_have_started", "action_dispatched", "option_attempted"].includes(data?.error?.side_effects) ? "unknown" : "failed", code: data?.error?.code ?? "postcondition_failed" });
      const descendantIds = /* @__PURE__ */ new Set([step.id]), dependents = /* @__PURE__ */ new Set();
      for (let changed = true; changed; ) {
        changed = false;
        for (const dependent of record2.steps) if (!descendantIds.has(dependent.id) && dependent.depends_on.some((id3) => descendantIds.has(id3))) {
          descendantIds.add(dependent.id);
          dependents.add(dependent.field);
          changed = true;
        }
      }
      const unaffected = binding.fields.filter((old) => old.label !== step.field && !field.relatedFields?.includes(old.label) && !(field.role === "date-group" && old.label.startsWith(`${step.field} / `)) && !dependents.has(old.label));
      try {
        this.assertRecord({ ...binding, fields: unaffected }, state.raw);
      } catch {
        fail("unexpected_record_change");
      }
      binding.fields = structuredClone(state.raw.fields.filter((f2) => f2.scope === binding.scope && f2.frame === binding.frame && f2.tag !== "button" && f2.role !== "button"));
    } catch (error2) {
      if (result.status === "pending") Object.assign(result, { status: "unknown", code: codeOf(error2) });
      throw error2;
    } finally {
      clearTimeout(timer);
      run.controller.signal.removeEventListener("abort", abort);
    }
  }
  acceptDerivedEffect(run, step, page) {
    for (const effect of run.derivedEffects ?? []) {
      if (effect.source_step !== step.id) continue;
      const binding = run.records.get(effect.target_record)?.binding;
      if (!binding) continue;
      const fields2 = page.fields.filter((f2) => f2.frame === binding.frame && f2.scope === binding.scope && f2.label === effect.field);
      if (effect.remove_empty && fields2.length === 0) {
        const old = binding.fields.find((f2) => f2.label === effect.field);
        if (old && !old.value && old.checked !== true) {
          this.assertIdentity(binding, page);
          binding.fields = binding.fields.filter((f2) => f2 !== old);
        }
        continue;
      }
      if (fields2.length !== 1) continue;
      const field = fields2[0];
      const valueStep = effect.value_step ? run.plan.records.flatMap((r) => r.steps).find((s) => s.id === effect.value_step) : step;
      const plannedTarget = effect.planned_target && run.plan.records.find((r) => r.id === effect.target_record)?.steps.some((s) => s === valueStep && s.field === effect.field);
      if (!valueStep || !plannedTarget && valueStep !== step && run.steps.get(valueStep.id)?.status !== "verified_ui") continue;
      if (!plannedTarget && !(field.disabled || field.readonly) || !matches(field, run.plan.facts[valueStep.source_ref].value)) continue;
      this.assertIdentity(binding, page);
      binding.fields = binding.fields.map((old) => old.label === effect.field ? structuredClone(field) : old);
    }
  }
  assertDocument(run, navigation) {
    if (navigation !== run.plan.navigation_id) fail("page_changed");
  }
  assertIdentity(binding, page) {
    if (binding.identity && !page.records?.some((r) => r.identity === binding.identity && r.frame === binding.frame && r.scope === binding.scope)) fail("record_identity_changed");
  }
  assertRecord(binding, page) {
    if (binding.identity && !page.records?.some((r) => r.identity === binding.identity && r.frame === binding.frame && r.scope === binding.scope)) {
      const signature = (fields2) => JSON.stringify(fields2.filter((f2) => f2.tag !== "button" && f2.role !== "button").map((f2) => JSON.stringify([f2.label, f2.tag, f2.type, fieldValue(f2)])).sort());
      const expected = signature(binding.fields);
      const candidates = (page.records ?? []).filter((r) => r.frame === binding.frame && r.scope.startsWith(`${binding.section} / `) && signature(page.fields.filter((f2) => f2.frame === r.frame && f2.scope === r.scope)) === expected);
      if (candidates.length !== 1) fail("record_identity_changed");
      binding.identity = candidates[0].identity;
      binding.scope = candidates[0].scope;
      binding.fields = structuredClone(page.fields.filter((f2) => f2.frame === binding.frame && f2.scope === binding.scope && f2.tag !== "button" && f2.role !== "button"));
    }
    this.assertIdentity(binding, page);
    for (const key2 of new Set(binding.fields.map(fieldKey))) {
      const normalized2 = (fields2) => fields2.filter((f2) => fieldKey(f2) === key2).map((f2) => JSON.stringify([f2.tag, f2.type, fieldValue(f2)])).sort();
      if (!same(normalized2(binding.fields), normalized2(page.fields.filter((f2) => f2.scope === binding.scope)))) throw Object.assign(new Error("external_change"), { scope: binding.scope, field: binding.fields.find((f2) => fieldKey(f2) === key2).label });
    }
  }
  findField(binding, page, label2) {
    const fields2 = page.fields.filter((f2) => f2.scope === binding.scope && f2.frame === binding.frame && f2.label === label2 && f2.tag !== "button" && f2.role !== "button");
    if (fields2.length !== 1) fail("target_unresolved");
    return fields2[0];
  }
  assertProtected(run, page) {
    for (const target of run.plan.protected_fields) {
      const binding = run.records.get(target.record_id)?.binding;
      if (!binding) fail("protected_binding_unavailable");
      const values = (fields2) => fields2.filter((f2) => f2.frame === binding.frame && f2.scope === binding.scope && (f2.label === target.field || f2.label.startsWith(`${target.field} / `))).map((f2) => JSON.stringify([f2.label, f2.tag, f2.type, fieldValue(f2)])).sort();
      const before = values(binding.fields);
      if (!before.length || !same(before, values(page.fields))) fail("protected_field_changed");
    }
  }
  blockRecord(run, record2, code) {
    for (const step of record2.steps) if (run.steps.get(step.id).status === "pending") Object.assign(run.steps.get(step.id), { status: "blocked", code });
  }
  audit(run, page) {
    const fields2 = page.fields.filter((f2) => f2.visible && f2.tag !== "button" && f2.role !== "button" && f2.type !== "hidden");
    const described = (field) => run.plan.records.some((record2) => {
      const binding = run.records.get(record2.id)?.binding;
      if (!binding || binding.scope !== field.scope || binding.frame !== field.frame) return false;
      const labels = [
        ...record2.steps.map((s) => s.field),
        ...run.plan.protected_fields.filter((t) => t.record_id === record2.id).map((t) => t.field),
        ...run.plan.unresolved.filter((t) => t.record_id === record2.id).map((t) => t.field)
      ];
      return labels.some((label3) => field.label === label3 || field.label.startsWith(`${label3} / `));
    });
    const label2 = (field) => ({ scope: field.scope, field: field.label });
    return {
      manual_tasks: manualTasks(page),
      visible_fields: fields2.length,
      covered_fields: fields2.filter(described).length,
      unplanned_fields: fields2.filter((f2) => !described(f2)).map(label2),
      required_missing: [...fields2.filter(fieldMissing).map(label2), ...manualTasks(page).filter((t) => t.reason === "attachment" && t.blocks_navigation).map((t) => ({ scope: t.scope, field: t.field }))],
      invalid_fields: fields2.filter((f2) => f2.invalid || f2.error).map(label2),
      page_error_count: page.validations.length
    };
  }
  authorize(owner, id3, token) {
    const run = this.runs.get(id3);
    if (!run) fail("run_not_found");
    if (run.owner !== owner && (!token || !timingSafeEqual(hash(token), run.secretHash))) fail("run_access_denied");
    return run;
  }
  stop(run, reason) {
    if (["completed", "partial", "expired", "cancelled"].includes(run.status)) return;
    run.controller.abort(new Error(reason));
    run.lastError = reason;
    run.status = run.windowActive ? "cancelling" : "cancelled";
    if (!run.windowActive) {
      for (const result of run.steps.values()) if (result.status === "pending") result.status = "cancelled";
      if (this.active === run.id) this.active = void 0;
    }
  }
  expire() {
    for (const [id3, run] of this.runs) if (!run.windowActive) {
      if (now() >= run.expires) {
        if (this.active === id3) this.active = void 0;
        this.runs.delete(id3);
      } else if (now() >= run.deadline) this.stop(run, "run_budget_exhausted");
    }
  }
  summary(run) {
    const results = [...run.steps.values()].map((result) => ({ ...result }));
    const counts = {};
    for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1;
    return {
      ok: run.status === "completed",
      run_id: run.id,
      status: run.status,
      counts,
      results,
      protected_fields: run.plan.protected_fields.map((target) => ({
        ...target,
        scope: run.records.get(target.record_id)?.binding?.scope,
        verification: run.audit ? "unchanged_ui" : "not_verified"
      })),
      unresolved: run.plan.unresolved,
      elapsed_ms: now() - run.created,
      last_progress_at: new Date(run.updated).toISOString(),
      expires_at: new Date(run.expires).toISOString(),
      remaining_budget_ms: Math.max(0, run.deadline - now()),
      ...run.lastError ? { error: { code: run.lastError, ...run.lastErrorTarget } } : {},
      persistence: "not_verified",
      ...run.audit ? { page_audit: run.audit } : {},
      unassigned_created_records: run.spawned.filter((item) => !item.claimed).map((item) => ({ source_step: item.source, scope: item.binding.scope })),
      added_records: [...run.records.entries()].filter(([, r]) => r.added).map(([id3, r]) => ({
        record_id: id3,
        scope: r.binding?.scope,
        complete: results.some((result) => result.record_id === id3 && result.status === "verified_ui") && results.filter((result) => result.record_id === id3).every((result) => result.status === "verified_ui" || result.status === "not_exposed")
      })),
      uncertain_adds: [...run.records.entries()].filter(([, r]) => r.addAttempted && !r.added && r.blocked !== "add_failed").map(([id3]) => id3)
    };
  }
};

// src/browser/form-module-journey.ts
var hash2 = (s) => createHash9("sha256").update(s).digest();
var button2 = (f2) => f2.tag === "button" || f2.role === "button";
var fields = (raw, section) => raw.fields.filter((f2) => (f2.scope === section || f2.scope.startsWith(section + " / \u7B2C")) && !button2(f2));
var editable = (raw, section) => fields(raw, section).filter((f2) => !f2.disabled && !manualReason(f2) && raw.fields.some((b) => button2(b) && (b.label === "\u4FDD\u5B58" || section === "\u8D44\u683C\u8BC1\u4E66" && b.label === "\u786E\u5B9A") && b.scope === f2.scope));
var identity2 = (raw) => {
  const u = new URL(raw.url);
  u.hash = "";
  u.searchParams.sort();
  return hash2(u.href).toString("hex");
};
var recipe = recipes.find((r) => r.family === "guopin");
var key = (t) => `${t.section}:${t.source}:${t.record}`;
var locationPreview = (value) => {
  const path = value.split(" / ");
  if (path[0] === "\u4E2D\u56FD" && path[1] === "\u4E0A\u6D77" && path[2] === "\u4E0A\u6D77") return ["\u4E0A\u6D77\u5E02", ...path.slice(3)].join("-");
  return path.filter((v) => v !== "\u4E2D\u56FD").join("-");
};
var anchors = (raw, scope) => {
  const intent2 = scope === "\u6C42\u804C\u610F\u5411" || scope.startsWith("\u6C42\u804C\u610F\u5411 / \u7B2C");
  const labels = intent2 ? ["\u671F\u671B\u804C\u4F4D", "\u5DE5\u4F5C\u5730\u533A", "\u671F\u671B\u884C\u4E1A", "\u85AA\u8D44\u8981\u6C42"] : ["\u9879\u76EE\u540D\u79F0", "\u5355\u4F4D\u540D\u79F0", "\u804C\u4F4D\u540D\u79F0", "\u5B66\u6821\u540D\u79F0", "\u8D77\u6B62\u65F6\u95F4", "\u5728\u804C\u65F6\u95F4", "\u5C31\u8BFB\u5E74\u6708", "\u81EA\u6211\u8BC4\u4EF7", "\u8BC1\u4E66\u540D\u79F0"];
  const result = raw.fields.filter((f2) => f2.scope === scope && labels.includes(f2.label) && f2.value).map((f2) => ({ label: f2.label, value: !intent2 ? f2.value : f2.label === "\u5DE5\u4F5C\u5730\u533A" ? locationPreview(f2.value) : ["\u671F\u671B\u804C\u4F4D", "\u671F\u671B\u884C\u4E1A"].includes(f2.label) ? f2.value.split(" / ").at(-1) : f2.value }));
  if (intent2) {
    const salary2 = ["\u6700\u4F4E", "\u6700\u9AD8"].map((s) => raw.fields.find((f2) => f2.scope === scope && f2.label === `\u85AA\u8D44\u8981\u6C42\uFF08\u5143/\u6708\uFF09 / ${s}`)?.value);
    if (salary2.every(Boolean)) result.push({ label: "\u85AA\u8D44\u8981\u6C42", value: `${salary2[0].replace(/K$/, "")}-${salary2[1]}` });
  }
  return result;
};
var previewScopes = (raw, section) => [...new Set(fields(raw, section).filter((f2) => f2.disabled && f2.value).map((f2) => f2.scope))];
var matchingPreview = (raw, section, wanted) => previewScopes(raw, section).filter((scope) => wanted.length > 0 && wanted.every((a) => anchors(raw, scope).some((f2) => f2.label === a.label && f2.value.replace(/\s+/g, " ").trim() === a.value.replace(/\s+/g, " ").trim())));
var FormModuleJourney = class {
  runs = /* @__PURE__ */ new Map();
  has(id3) {
    return this.runs.has(id3);
  }
  get activeId() {
    return [...this.runs.values()].find((j) => j.working)?.id;
  }
  start(owner, request, input, raw) {
    const u = new URL(raw.url);
    if (u.protocol !== "https:" || u.hostname !== "c.iguopin.com" || u.pathname !== "/resume" || !u.searchParams.get("id")) throw new Error("workflow_unrecognized");
    for (const [id3, j2] of this.runs) if (!j2.working && Date.now() - j2.created > 18e5) this.runs.delete(id3);
    const previous = [...this.runs.values()].find((j2) => j2.request === request);
    if (previous) {
      if (previous.owner !== owner) throw new Error("journey_access_denied");
      if (JSON.stringify([previous.pageId, previous.profileId, previous.revision, previous.policy, previous.testMode]) !== JSON.stringify([input.pageId, input.profileId, input.revision, input.policy, input.testMode])) throw new Error("request_id_conflict");
      return { ...this.summary(previous), replayed: true };
    }
    if (this.runs.size >= 4) throw new Error("journey_capacity_exceeded");
    const token = randomUUID6() + randomUUID6();
    const j = { ...input, id: randomUUID6(), owner, request, secret: hash2(token), created: Date.now(), application: identity2(raw), status: "ready", working: false, controller: new AbortController(), initialSections: recipe.sections.flatMap((r) => r.sections.filter((section) => previewScopes(raw, section).length > 0)), done: [] };
    this.runs.set(j.id, j);
    return { ...this.summary(j), resume_token: token };
  }
  get(owner, id3, token) {
    const j = this.runs.get(id3);
    if (!j || Date.now() - j.created > 18e5) throw new Error("journey_expired");
    if (j.owner !== owner) {
      if (!token || !timingSafeEqual2(hash2(token), j.secret)) throw new Error("journey_access_denied");
      if (j.working) throw new Error("journey_in_progress");
      j.owner = owner;
    }
    return j;
  }
  page(owner, id3, token) {
    return this.get(owner, id3, token).pageId;
  }
  status(owner, id3, token) {
    return this.summary(this.get(owner, id3, token));
  }
  cancel(owner, id3, token) {
    const j = this.get(owner, id3, token);
    j.controller.abort(new Error("operation_cancelled"));
    j.current?.runner.cancel(j.id, j.current.runId);
    j.status = j.working ? "cancelling" : "cancelled";
    return this.summary(j);
  }
  cancelOwner(owner) {
    for (const j of this.runs.values()) if (j.owner === owner) this.cancel(owner, j.id);
  }
  clear() {
    for (const j of this.runs.values()) this.cancel(j.owner, j.id);
    this.runs.clear();
  }
  async execute(owner, id3, engine, readProfile, signal, windowMs = 85e3) {
    const j = this.get(owner, id3);
    if (j.working) throw new Error("journey_in_progress");
    if (!["ready", "paused_window", "cancelled", "manual_boundary"].includes(j.status) && !j.pending) return this.summary(j);
    j.controller = new AbortController();
    j.working = true;
    j.status = "working";
    delete j.issue;
    const abort = () => j.controller.abort(signal?.reason ?? new Error("operation_cancelled"));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const end = Date.now() + Math.min(windowMs, 85e3);
    try {
      while (Date.now() < end - 2500) {
        j.controller.signal.throwIfAborted();
        const profile = await readProfile(j.profileId, j.revision);
        if (profile.profile_id !== j.profileId || profile.revision !== j.revision) throw new Error("profile_revision_changed");
        let c = await engine.capturePlanning(j.pageId, j.controller.signal);
        engine.requireSupported?.(c.raw);
        if (identity2(c.raw) !== j.application) throw new Error("workflow_changed");
        if (c.raw.authenticationRequired) {
          j.status = "manual_boundary";
          j.issue = { code: "authentication_required" };
          break;
        }
        if (j.manualCheckpoint) {
          if (!verifyManualCheckpoint(j.manualCheckpoint, c.raw)) throw new Error("ordinary_fields_changed_during_manual_pause");
          delete j.manualCheckpoint;
          delete j.current;
        }
        if (j.pending) {
          const p = j.pending;
          const waitingUntil = Math.min(end - 500, Date.now() + 5e3);
          while (Date.now() < waitingUntil && (p.kind === "open" ? !editable(c.raw, p.section).length : editable(c.raw, p.section).length || !matchingPreview(c.raw, p.section, p.anchors).length)) {
            await new Promise((resolve5) => setTimeout(resolve5, 100));
            j.controller.signal.throwIfAborted();
            c = await engine.capturePlanning(j.pageId, j.controller.signal);
            if (identity2(c.raw) !== j.application) throw new Error("workflow_changed");
            if (c.raw.authenticationRequired) break;
          }
          if (c.raw.authenticationRequired) {
            j.status = "manual_boundary";
            j.issue = { code: "authentication_required" };
            break;
          }
          if (p.kind === "open") {
            const scopes = [...new Set(editable(c.raw, p.section).map((f2) => f2.scope))];
            if (scopes.length !== 1 || p.before.includes(scopes[0])) {
              j.status = "needs_input";
              j.issue = { code: "open_result_unknown", section: p.section };
              break;
            }
          } else {
            const found = matchingPreview(c.raw, p.section, p.anchors).filter((scope) => !p.before.includes(JSON.stringify(anchors(c.raw, scope))) || !recipe.sections.find((r) => r.sections.includes(p.section))?.repeated);
            if (editable(c.raw, p.section).length || found.length !== 1) {
              j.status = "needs_input";
              j.issue = { code: "save_result_unknown", section: p.section };
              break;
            }
            j.done.push({ ...p.target, status: "saved_preview_verified" });
            delete j.current;
          }
          delete j.pending;
        }
        const sources = normalizeProfile(profile), comp = compilePlan(c, profile, j.policy, j.testMode);
        const bound = (comp.record_sources ?? []).map((source) => ({ source, record: comp.plan?.records.find((r) => r.id === source.plan_record) })).filter((x) => x.record);
        const queue = recipe.sections.flatMap((rule) => rule.sections.filter((section) => c.raw.sections.includes(section)).flatMap((section) => rule.sources.flatMap((source) => (sources[source]?.records ?? []).filter((row) => rule.fields.some((field) => resolveFact(profile, sources, row, field))).map((row) => ({ section, source, record: row.id })))));
        for (const target2 of queue) {
          if (j.done.some((t) => key(t) === key(target2))) continue;
          const hit = bound.find((b) => b.record.section === target2.section && b.source.source_section === target2.source && b.source.source_record === target2.record);
          const scope = c.records.find((r) => r.binding === hit?.record?.binding)?.scope;
          if (scope && fields(c.raw, target2.section).filter((f2) => f2.scope === scope).every((f2) => f2.disabled) && fields(c.raw, target2.section).some((f2) => f2.scope === scope && f2.value)) j.done.push({ ...target2, status: "existing_record_preserved" });
        }
        const target = j.current?.target ?? queue.find((t) => !j.done.some((d) => key(d) === key(t)) && editable(c.raw, t.section).length && bound.some((b) => b.source.source_record === t.record && b.source.source_section === t.source && b.record.steps.length)) ?? queue.find((t) => !j.done.some((d) => key(d) === key(t)));
        if (!target) {
          j.status = "ready_for_review";
          j.issue = { code: "ordinary_modules_processed", manual_tasks: manualTasks(c.raw), unhandled_modules: c.raw.sections.filter((section) => !recipe.sections.some((r) => r.sections.includes(section)) && c.raw.fields.some((f2) => f2.scope === section && f2.plannerFamily === "guopin")) };
          break;
        }
        const editors = [...new Set(editable(c.raw, target.section).map((f2) => f2.scope))];
        const otherEditors = recipe.sections.flatMap((r) => r.sections.filter((section) => section !== target.section).flatMap((section) => editable(c.raw, section)));
        if (otherEditors.length) {
          j.status = "needs_input";
          j.issue = { code: "another_editor_open", section: target.section };
          break;
        }
        if (!editors.length) {
          const existing = previewScopes(c.raw, target.section);
          if (existing.length && j.initialSections.includes(target.section) && j.policy.records !== "append") {
            j.status = "needs_input";
            j.issue = { code: "append_requires_policy", section: target.section };
            break;
          }
          const controls = c.raw.fields.filter((f2) => f2.scope === target.section && button2(f2) && ["\u6DFB\u52A0", "\u7F16\u8F91"].includes(f2.label));
          if (controls.length !== 1) {
            j.status = "needs_input";
            j.issue = { code: "module_open_unavailable", section: target.section };
            break;
          }
          j.pending = { kind: "open", section: target.section, before: editors, anchors: [] };
          await engine.activate({ pageId: j.pageId, scope: target.section, target: controls[0].label, intent: "open", operationId: `${j.id}:${key(target)}:open`, signal: j.controller.signal, testMode: j.testMode });
          await new Promise((resolve5) => setTimeout(resolve5, 150));
          continue;
        }
        if (editors.length !== 1) throw new Error("multiple_editors_open");
        if (!j.current) {
          const hit = bound.find((b) => b.record.section === target.section && b.source.source_section === target.source && b.source.source_record === target.record);
          const scope = c.records.find((r) => r.binding === hit?.record?.binding)?.scope;
          if (!comp.plan || !hit?.record || scope !== editors[0]) {
            j.status = "needs_input";
            j.issue = { code: "editor_source_ambiguous", section: target.section };
            break;
          }
          const plan = structuredClone(comp.plan);
          plan.records = [hit.record];
          plan.protected_fields = plan.protected_fields.filter((f2) => f2.record_id === hit.record.id);
          plan.unresolved = plan.unresolved.filter((f2) => f2.record_id === hit.record.id);
          const runner = new FormRunner(), entry = runner.start(j.id, `${j.id}:${key(target)}`, plan);
          if (!entry.run_id) throw new Error("journey_plan_invalid");
          const runId = String(entry.run_id);
          runner.markPrepared(j.id, runId);
          runner.setDerivedEffects(j.id, runId, comp.derived_effects ?? []);
          runner.setGuard(j.id, runId, async (raw) => {
            const latest = await readProfile(j.profileId, j.revision);
            if (latest.profile_id !== j.profileId || latest.revision !== j.revision) throw new Error("profile_revision_changed");
            if (identity2(raw) !== j.application) throw new Error("workflow_changed");
          });
          j.current = { runner, runId, target, scope };
        }
        const current = j.current, prior = current.runner.status(j.id, current.runId);
        if (prior.status !== "ready" && prior.status !== "completed") current.runner.resume(j.id, current.runId);
        const result = prior.status === "completed" ? prior : await current.runner.executeWindow(j.id, current.runId, engine, j.controller.signal, Math.max(1, end - Date.now() - 1500));
        if (result.status === "paused_window") {
          j.status = "paused_window";
          break;
        }
        if (comp.reobserve_after_execution && !result.error && Array.isArray(result.results) && result.results.every((r) => r.status === "verified_ui")) {
          delete j.current;
          continue;
        }
        c = await engine.capturePlanning(j.pageId, j.controller.signal);
        const ordinary = editable(c.raw, target.section);
        const tasks = manualTasks(c.raw).filter((t) => t.scope === current.scope || t.scope === target.section);
        if (tasks.some((t) => t.blocks_navigation)) {
          j.status = "manual_boundary";
          j.issue = { code: "manual_fields", tasks };
          j.manualCheckpoint = manualCheckpoint(c.raw);
          break;
        }
        if (result.error || !Array.isArray(result.results) || result.results.some((r) => r.status !== "verified_ui") || ordinary.some((f2) => fieldMissing(f2) || f2.invalid || f2.error) || comp.plan?.unresolved.some((u) => u.record_id === bound.find((b) => b.source.source_record === target.record)?.record?.id)) {
          j.status = "needs_input";
          j.issue = { code: "module_incomplete", section: target.section, result };
          break;
        }
        const savedAnchors = anchors(c.raw, current.scope);
        if (!savedAnchors.length) {
          j.status = "needs_input";
          j.issue = { code: "save_verification_unavailable", section: target.section };
          break;
        }
        j.pending = { kind: "save", section: target.section, target, before: previewScopes(c.raw, target.section).map((scope) => JSON.stringify(anchors(c.raw, scope))), anchors: savedAnchors };
        await engine.activate({ pageId: j.pageId, scope: current.scope, target: target.section === "\u8D44\u683C\u8BC1\u4E66" ? "\u786E\u5B9A" : "\u4FDD\u5B58", intent: "save_record", operationId: `${j.id}:${key(target)}:save`, signal: j.controller.signal, testMode: j.testMode });
        await new Promise((resolve5) => setTimeout(resolve5, 200));
      }
      if (j.status === "working") j.status = "paused_window";
    } catch (error2) {
      j.status = j.controller.signal.aborted ? "cancelled" : "needs_input";
      const code = error2 instanceof Error ? error2.message : "";
      j.issue = { code: /^[a-z_]+$/.test(code) ? code : "module_execution_failed" };
    } finally {
      signal?.removeEventListener("abort", abort);
      j.working = false;
    }
    return this.summary(j);
  }
  summary(j) {
    return { ok: ["ready", "paused_window", "ready_for_review"].includes(j.status), journey_id: j.id, status: j.status, page_id: j.pageId, profile_revision: j.revision, family: "guopin", records: j.done, ...j.pending ? { pending_action: j.pending.kind } : {}, ...j.issue ? { issue: j.issue } : {}, persistence: "not_verified", submission: "not_performed", elapsed_ms: Date.now() - j.created };
  }
};

// src/browser/form-journey.ts
var hash3 = (s) => createHash10("sha256").update(s).digest();
var manual = /(承诺|声明|授权|签署|最终提交|投递确认|确认投递|上传)/;
var sameWorkflow = (a, b) => a.template === b.template && JSON.stringify(a.steps) === JSON.stringify(b.steps);
var applicationIdentity = (raw) => {
  const url = new URL(raw.url);
  url.hash = "";
  url.searchParams.sort();
  return hash3(url.href).toString("hex");
};
function validWorkflow(raw) {
  const w = raw.workflow;
  if (!w || w.family !== "job51" || !w.steps.length || w.steps.length > 30 || w.current < 0 || w.current >= w.steps.length || new Set(w.steps).size !== w.steps.length || !w.heading.startsWith(w.steps[w.current])) throw new Error("workflow_unrecognized");
  return w;
}
var FormJourney = class {
  runs = /* @__PURE__ */ new Map();
  modules = new FormModuleJourney();
  get activeId() {
    return [...this.runs.values()].find((j) => j.working)?.id ?? this.modules.activeId;
  }
  start(owner, request, input, raw) {
    if (raw.fields.some((f2) => f2.plannerFamily === "guopin")) return this.modules.start(owner, request, input, raw);
    for (const [id3, j2] of this.runs) if (!j2.working && Date.now() - j2.created > 18e5) this.runs.delete(id3);
    const previous = [...this.runs.values()].find((j2) => j2.request === request);
    if (previous) {
      if (previous.owner !== owner) throw new Error("journey_access_denied");
      if (previous.pageId !== input.pageId || previous.profileId !== input.profileId || previous.revision !== input.revision || JSON.stringify(previous.policy) !== JSON.stringify(input.policy) || previous.testMode !== input.testMode) throw new Error("request_id_conflict");
      return { ...this.summary(previous), replayed: true };
    }
    if (this.runs.size >= 4) throw new Error("journey_capacity_exceeded");
    const workflow = validWorkflow(raw), token = randomUUID7() + randomUUID7();
    const j = { ...input, id: randomUUID7(), owner, request, secret: hash3(token), workflow, application: applicationIdentity(raw), created: Date.now(), status: "ready", controller: new AbortController(), working: false, pages: [] };
    this.runs.set(j.id, j);
    return { ...this.summary(j), resume_token: token };
  }
  get(owner, id3, token) {
    const j = this.runs.get(id3);
    if (!j) throw new Error("journey_expired");
    if (j.owner !== owner) {
      if (!token || !timingSafeEqual3(hash3(token), j.secret)) throw new Error("journey_access_denied");
      if (j.working) throw new Error("journey_in_progress");
      j.owner = owner;
    }
    if (Date.now() - j.created > 18e5) throw new Error("journey_expired");
    return j;
  }
  page(owner, id3, token) {
    return this.modules.has(id3) ? this.modules.page(owner, id3, token) : this.get(owner, id3, token).pageId;
  }
  status(owner, id3, token) {
    return this.modules.has(id3) ? this.modules.status(owner, id3, token) : this.summary(this.get(owner, id3, token));
  }
  cancel(owner, id3, token) {
    if (this.modules.has(id3)) return this.modules.cancel(owner, id3, token);
    const j = this.get(owner, id3, token);
    j.controller.abort(new Error("operation_cancelled"));
    j.status = j.working ? "cancelling" : "cancelled";
    if (j.current) j.current.runner.cancel(j.id, j.current.runId);
    return this.summary(j);
  }
  cancelOwner(owner) {
    this.modules.cancelOwner(owner);
    for (const j of this.runs.values()) if (j.owner === owner) this.cancel(owner, j.id);
  }
  clear() {
    this.modules.clear();
    for (const j of this.runs.values()) this.cancel(j.owner, j.id);
    this.runs.clear();
  }
  async execute(owner, id3, engine, readProfile, signal, windowMs = 85e3) {
    if (this.modules.has(id3)) return this.modules.execute(owner, id3, engine, readProfile, signal, windowMs);
    const j = this.get(owner, id3);
    if (j.working) throw new Error("journey_in_progress");
    if (!["ready", "paused_window", "cancelled"].includes(j.status) && !(j.status === "needs_input" && j.pending) && !(j.status === "manual_boundary" && j.manualCheckpoint)) return this.summary(j);
    j.controller = new AbortController();
    j.working = true;
    j.status = "working";
    delete j.issue;
    const abort = () => j.controller.abort(signal?.reason ?? new Error("operation_cancelled"));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const end = Date.now() + Math.min(windowMs, 85e3);
    try {
      while (Date.now() < end - 2e3) {
        j.controller.signal.throwIfAborted();
        const profile = await readProfile(j.profileId, j.revision);
        const catalog = await engine.capturePlanning(j.pageId, j.controller.signal), w = validWorkflow(catalog.raw);
        engine.requireSupported?.(catalog.raw);
        if (!sameWorkflow(j.workflow, w) || applicationIdentity(catalog.raw) !== j.application) throw new Error("workflow_changed");
        if (j.pending) {
          if (w.current === j.pending.to) {
            j.workflow = w;
            delete j.pending;
            delete j.current;
          } else {
            j.status = "needs_input";
            j.issue = { code: "transition_result_unknown", from: j.pending.from, to: j.pending.to };
            break;
          }
        }
        if (j.manualPageTransition === j.workflow.current && j.manualCheckpoint?.fields.length === 0 && w.current === j.workflow.current + 1) {
          if (!j.pages.some((p) => p.index === j.workflow.current)) j.pages.push({ index: j.workflow.current, step: j.workflow.steps[j.workflow.current], status: "user_advanced_unverified" });
          j.workflow = w;
          delete j.manualCheckpoint;
          delete j.manualPageTransition;
          delete j.current;
        }
        if (w.current !== j.workflow.current) throw new Error("workflow_position_changed");
        if (j.manualCheckpoint) {
          if (!verifyManualCheckpoint(j.manualCheckpoint, catalog.raw)) throw new Error("ordinary_fields_changed_during_manual_pause");
          if (manualTasks(catalog.raw).some((t) => t.blocks_navigation)) {
            j.status = "manual_boundary";
            j.issue = { code: "manual_fields", tasks: manualTasks(catalog.raw) };
            break;
          }
          delete j.manualCheckpoint;
          delete j.current;
        }
        const step = w.steps[w.current];
        const optionalUpload = w.optionalAttachment && /上传.*附件简历/.test(step);
        if (manual.test(step) && !optionalUpload) {
          j.status = "manual_boundary";
          j.issue = { code: "manual_boundary", step, tasks: manualTasks(catalog.raw), next_action: w.current < w.steps.length - 1 ? "user_handle_page_then_resume" : "user_final_review" };
          j.manualCheckpoint = manualCheckpoint(catalog.raw);
          if (w.current < w.steps.length - 1) j.manualPageTransition = w.current;
          break;
        }
        if (!j.current && !optionalUpload) {
          const compilation = compilePlan(catalog, profile, j.policy, j.testMode);
          if (compilation.recipe !== "51job/legacy-resume/v1") {
            j.status = "needs_input";
            j.issue = { code: "unsupported_variant" };
            break;
          }
          if (compilation.plan) {
            const runner = new FormRunner(), entry = runner.start(j.id, `${j.id}:${w.current}`, compilation.plan);
            if (!entry.run_id) throw new Error("journey_plan_invalid");
            const runId = String(entry.run_id), digest2 = catalogDigest(catalog.raw);
            runner.markPrepared(j.id, runId);
            runner.setGuard(j.id, runId, async (raw, first) => {
              await readProfile(j.profileId, j.revision);
              if (first && catalogDigest(raw) !== digest2) throw new Error("prepared_page_changed");
            });
            j.current = { runner, runId, index: w.current, reobserve: Boolean(compilation.reobserve_after_execution), digest: digest2 };
          } else {
            const tasks2 = manualTasks(catalog.raw);
            if (tasks2.some((t) => t.blocks_navigation)) {
              j.status = "manual_boundary";
              j.issue = { code: "manual_fields", tasks: tasks2 };
              j.manualCheckpoint = manualCheckpoint(catalog.raw);
              break;
            }
            const missing = catalog.raw.fields.filter((f2) => f2.role !== "button" && fieldMissing(f2));
            const explicitNone = compilation.dispositions.filter((d) => d.status === "explicit_none");
            if (missing.length || !explicitNone.length || compilation.dispositions.some((d) => !["explicit_none", "preserved", "outside_resume"].includes(d.status))) {
              j.status = "needs_input";
              j.issue = { code: "no_executable_plan", ...preparationSummary(compilation), missing: missing.map((f2) => ({ scope: f2.scope, field: f2.label })) };
              break;
            }
          }
        }
        if (j.current) {
          const { runner, runId } = j.current, prior = runner.status(j.id, runId);
          if (prior.status !== "ready" && prior.status !== "completed") runner.resume(j.id, runId);
          const result = prior.status === "completed" ? prior : await runner.executeWindow(j.id, runId, engine, j.controller.signal, Math.max(1, end - Date.now() - 1500));
          if (result.status === "paused_window") {
            j.status = "paused_window";
            break;
          }
          if (j.current.reobserve && !result.error && Array.isArray(result.results) && result.results.length && result.results.every((r) => r.status === "verified_ui")) {
            const after = await engine.captureRun(j.pageId, j.controller.signal);
            if (catalogDigest(after.raw) === j.current.digest || (j.replans ?? 0) >= 3) {
              j.status = "needs_input";
              j.issue = { code: "conditional_form_did_not_stabilize" };
              break;
            }
            j.replans = (j.replans ?? 0) + 1;
            delete j.current;
            continue;
          }
          if (result.status !== "completed") {
            const after = (await engine.captureRun(j.pageId, j.controller.signal)).raw, tasks2 = manualTasks(after);
            if (!result.error && Array.isArray(result.results) && result.results.every((r) => ["verified_ui", "not_exposed"].includes(r.status)) && tasks2.some((t) => t.blocks_navigation)) {
              j.status = "manual_boundary";
              j.issue = { code: "manual_fields", tasks: tasks2, page_result: result };
              j.manualCheckpoint = manualCheckpoint(after);
              break;
            }
            j.status = "needs_input";
            j.issue = { code: "page_incomplete", page_result: result };
            break;
          }
          if (!j.pages.some((p) => p.index === w.current)) j.pages.push({ index: w.current, step, status: "verified_ui", counts: result.counts });
        } else if (!j.pages.some((p) => p.index === w.current)) j.pages.push({ index: w.current, step, status: optionalUpload ? "optional_attachment_skipped" : "explicit_none" });
        const currentRaw = (await engine.captureRun(j.pageId, j.controller.signal)).raw;
        const tasks = manualTasks(currentRaw);
        const completedPage = j.pages.find((p) => p.index === w.current);
        if (completedPage) completedPage.manual_tasks = tasks;
        if (tasks.some((t) => t.blocks_navigation)) {
          j.status = "manual_boundary";
          j.issue = { code: "manual_fields", tasks };
          j.manualCheckpoint = manualCheckpoint(currentRaw);
          break;
        }
        if (w.current === w.steps.length - 1) {
          j.status = "ready_for_review";
          break;
        }
        if (!w.next) {
          j.status = "needs_input";
          j.issue = { code: "next_control_unavailable" };
          break;
        }
        if (Date.now() > end - 5e3) {
          j.status = "paused_window";
          break;
        }
        const before = (await engine.captureRun(j.pageId, j.controller.signal)).raw;
        if (!sameWorkflow(w, validWorkflow(before)) || applicationIdentity(before) !== j.application || before.workflow.current !== w.current) throw new Error("workflow_changed");
        if (before.validations.length || before.fields.some((f2) => f2.invalid || f2.error || f2.role !== "button" && fieldMissing(f2))) {
          j.status = "needs_input";
          j.issue = { code: "page_validation_failed" };
          break;
        }
        j.pending = { from: w.current, to: w.current + 1, dispatched: true };
        await engine.activate({ pageId: j.pageId, target: "\u4E0B\u4E00\u6B65", intent: "next_step", operationId: `${j.id}:next:${w.current}`, signal: j.controller.signal, testMode: j.testMode });
        const until = Math.min(end, Date.now() + 7e3);
        let advanced;
        while (Date.now() < until) {
          j.controller.signal.throwIfAborted();
          try {
            const nextRaw = (await engine.captureRun(j.pageId, j.controller.signal)).raw;
            const next = validWorkflow(nextRaw);
            if (applicationIdentity(nextRaw) !== j.application) throw new Error("workflow_changed");
            if (sameWorkflow(w, next) && next.current === w.current + 1) {
              advanced = next;
              break;
            }
          } catch (error2) {
            if (j.controller.signal.aborted) throw error2;
          }
          await new Promise((resolve5) => setTimeout(resolve5, 100));
        }
        if (!advanced) {
          j.status = "needs_input";
          j.issue = { code: "transition_result_unknown", from: w.current, to: w.current + 1 };
          break;
        }
        j.workflow = advanced;
        delete j.pending;
        delete j.current;
        delete j.replans;
      }
      if (j.status === "working") j.status = "paused_window";
    } catch (error2) {
      j.status = j.controller.signal.aborted ? "cancelled" : "needs_input";
      const code = error2 instanceof Error ? error2.message : "";
      j.issue = { code: /^[a-z_]+$/.test(code) ? code : "journey_execution_failed" };
    } finally {
      signal?.removeEventListener("abort", abort);
      j.working = false;
    }
    return this.summary(j);
  }
  summary(j) {
    return {
      ok: ["ready", "paused_window", "ready_for_review"].includes(j.status),
      journey_id: j.id,
      status: j.status,
      page_id: j.pageId,
      profile_revision: j.revision,
      current_step: j.workflow.steps[j.workflow.current],
      current_index: j.workflow.current,
      steps: j.workflow.steps,
      pages: j.pages,
      ...j.pending ? { transition: j.pending } : {},
      ...j.issue ? { issue: j.issue } : {},
      elapsed_ms: Date.now() - j.created,
      persistence: "not_verified",
      submission: "not_performed"
    };
  }
};

// src/browser/stale-uid-recovery.ts
var installedSymbol = /* @__PURE__ */ Symbol.for("resume-companion.stale-uid-recovery");
var comparableKeys = [
  "description",
  "placeholder",
  "keyshortcuts",
  "roledescription",
  "readonly",
  "required",
  "disabled"
];
function normalized(value) {
  return value === void 0 || value === null ? "" : String(value).replace(/\s+/g, " ").trim();
}
function collectPaths(root) {
  const paths = [];
  const visit = (node, ancestors) => {
    paths.push({ node, ancestors });
    for (const child of node.children ?? []) visit(child, [...ancestors, node]);
  };
  visit(root, []);
  return paths;
}
function pathForUid(root, uid) {
  return collectPaths(root).find((path) => path.node.id === uid);
}
function namedAncestors(path) {
  return path.ancestors.map((node) => ({ role: normalized(node.role), name: normalized(node.name) })).filter((item) => item.name.length > 0).slice(-6).reverse();
}
function contextualScore(expected, candidate) {
  let score = 0;
  for (const key2 of comparableKeys) {
    const left = normalized(expected.node[key2]);
    const right = normalized(candidate.node[key2]);
    if (left && left === right) score += 3;
  }
  const expectedAncestors = namedAncestors(expected);
  const candidateAncestors = namedAncestors(candidate);
  for (let index = 0; index < expectedAncestors.length; index++) {
    const expectedAncestor = expectedAncestors[index];
    if (!expectedAncestor) continue;
    const matchingIndex = candidateAncestors.findIndex(
      (candidateAncestor) => candidateAncestor.role === expectedAncestor.role && candidateAncestor.name === expectedAncestor.name
    );
    if (matchingIndex === -1) continue;
    score += Math.max(2, 14 - index * 2 - matchingIndex);
  }
  return score;
}
function resolveSemanticReplacement(expected, currentRoot) {
  const role = normalized(expected.node.role);
  const name = normalized(expected.node.name);
  const candidates = collectPaths(currentRoot).filter(
    (path) => normalized(path.node.role) === role && normalized(path.node.name) === name
  );
  if (candidates.length === 0) return { kind: "missing" };
  if (candidates.length === 1) return { kind: "resolved", path: candidates[0] };
  const ranked = candidates.map((path) => ({ path, score: contextualScore(expected, path) })).sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const runnerUp = ranked[1];
  if (best && runnerUp && best.score >= 8 && best.score - runnerUp.score >= 4) {
    return { kind: "resolved", path: best.path };
  }
  return { kind: "ambiguous", candidateCount: candidates.length };
}
function isDetachedUidError(error2) {
  if (!(error2 instanceof Error) || !error2.message.includes("no longer exists on the page")) return false;
  if (error2.cause instanceof Error) {
    if (/timed out|timeout|execution context|cannot find context/i.test(error2.cause.message)) {
      throw new Error("page_context_unavailable: Element resolution could not access the browser execution context. No semantic replacement was attempted; preserve the tab and retry after runtime recovery.", { cause: error2.cause });
    }
    if (!/no node|node.*(?:not found|does not belong|detached)|could not find.*node|no longer exists/i.test(error2.cause.message)) return false;
  }
  return true;
}
function isDetachedHandleError(error2) {
  if (!(error2 instanceof Error)) return false;
  const message = error2.message.toLowerCase();
  return message.includes("detached") || message.includes("no longer exists") || message.includes("could not find object with given id") || message.includes("js handle is disposed");
}
async function handleConnectionState(handle) {
  const debuggable = handle;
  if (!debuggable.evaluate) return "connected";
  try {
    return await debuggable.evaluate((element) => element.isConnected) ? "connected" : "detached";
  } catch (error2) {
    return isDetachedHandleError(error2) ? "detached" : "unknown";
  }
}
async function recoverHandle(page, uid, expected) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const currentRoot = await page.pptrPage.accessibility.snapshot({
      includeIframes: true,
      interestingOnly: true
    });
    if (!currentRoot) continue;
    const resolution = resolveSemanticReplacement(expected, currentRoot);
    if (resolution.kind === "ambiguous") {
      throw new Error(
        `stale_uid_ambiguous: Element uid ${uid} was replaced and ${resolution.candidateCount} current elements share its semantics. Take a fresh snapshot and narrow the control before retrying.`
      );
    }
    if (resolution.kind === "missing") continue;
    page.textSnapshot?.idToNode.set(uid, resolution.path.node);
    const handle = await resolution.path.node.elementHandle?.();
    if (handle) {
      console.error(`[resume-companion] stale_uid_recovered uid=${uid} attempt=${attempt}`);
      if (process.env.RESUME_COMPANION_DEBUG_STALE_UID === "1") {
        const debugHandle = handle;
        const state = await debugHandle.evaluate?.((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            connected: element.isConnected,
            disabled: element instanceof HTMLInputElement || element instanceof HTMLButtonElement ? element.disabled : false,
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
        });
        console.error(`[resume-companion] stale_uid_debug ${JSON.stringify(state)}`);
      }
      return handle;
    }
  }
  throw new Error(
    `stale_uid_unresolved: Element uid ${uid} was replaced and no unique current semantic match could be focused. Take a fresh snapshot and inspect the current control.`
  );
}
function locatorFrom(handle, transforms) {
  if (!handle.asLocator) throw new Error("stale_action_incompatible: Element handle does not expose a locator");
  let locator = handle.asLocator();
  for (const transform2 of transforms) {
    const method = locator[transform2.method];
    if (typeof method !== "function") {
      throw new Error(`stale_action_incompatible: Locator method ${transform2.method} is unavailable`);
    }
    locator = Reflect.apply(method, locator, transform2.args);
  }
  return locator;
}
async function intendedValueIsPresent(handle, expected) {
  if (!handle.evaluate) return false;
  try {
    return await handle.evaluate((element, rawExpected) => {
      const expectedText = String(rawExpected);
      const expectedBoolean = rawExpected === true || rawExpected === "true";
      if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
        return element.checked === expectedBoolean;
      }
      const role = element.getAttribute("role");
      if (role === "checkbox" || role === "radio" || role === "switch") {
        return element.getAttribute("aria-checked") === String(expectedBoolean);
      }
      if (element instanceof HTMLSelectElement || element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.value === expectedText;
      }
      if (element instanceof HTMLElement && element.isContentEditable) return element.innerText === expectedText;
      return false;
    }, expected);
  } catch {
    return false;
  }
}
function observeLocatorAction(locator) {
  let started = false;
  const listener2 = () => {
    started = true;
  };
  locator.on?.("action", listener2);
  return {
    didStart: () => started,
    stop: () => {
      locator.off?.("action", listener2);
    }
  };
}
async function replaceCurrentHandle(state) {
  const recovered = await recoverHandle(state.page, state.uid, state.expected);
  state.current = recovered;
  state.handles.add(recovered);
  return recovered;
}
async function replaceWithSettledHandle(state, timeoutMs = 600) {
  const deadline = Date.now() + timeoutMs;
  let recovered = await replaceCurrentHandle(state);
  while (Date.now() < deadline) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
    if (state.current === recovered && await handleConnectionState(recovered) !== "detached") return recovered;
    recovered = await replaceCurrentHandle(state);
  }
  return recovered;
}
async function runLocatorAction(state, transforms, action, args) {
  const attemptedHandle = state.current;
  const initialLocator = locatorFrom(attemptedHandle, transforms);
  const initialMethod = initialLocator[action];
  if (typeof initialMethod !== "function") throw new Error(`stale_action_incompatible: Locator action ${action} is unavailable`);
  const observation = observeLocatorAction(initialLocator);
  try {
    const result = await Reflect.apply(initialMethod, initialLocator, args);
    if (action !== "fill" || await handleConnectionState(attemptedHandle) !== "detached" && await intendedValueIsPresent(attemptedHandle, args[0])) {
      return result;
    }
    if (state.actionRecoveryUsed) {
      throw new Error(`stale_action_retry_exhausted: Element uid ${state.uid} lost the filled value after recovery. Take a fresh snapshot before retrying.`);
    }
    state.actionRecoveryUsed = true;
    const recovered = await replaceWithSettledHandle(state);
    if (await intendedValueIsPresent(recovered, args[0])) return result;
    console.error(`[resume-companion] stale_action_postcheck_retry uid=${state.uid} action=fill`);
    let retryLocator = locatorFrom(recovered, transforms);
    if (typeof retryLocator.setWaitForStableBoundingBox === "function") {
      retryLocator = Reflect.apply(retryLocator.setWaitForStableBoundingBox, retryLocator, [false]);
    }
    const retryMethod = retryLocator.fill;
    if (typeof retryMethod !== "function") throw new Error("stale_action_incompatible: Locator action fill is unavailable");
    const retryResult = await Reflect.apply(retryMethod, retryLocator, args);
    const verified = await handleConnectionState(recovered) === "detached" ? await replaceWithSettledHandle(state) : recovered;
    if (!await intendedValueIsPresent(verified, args[0])) {
      throw new Error(`stale_action_retry_exhausted: Element uid ${state.uid} did not retain the filled value after one semantic recovery. Take a fresh snapshot before retrying.`);
    }
    return retryResult;
  } catch (originalError) {
    if (await handleConnectionState(attemptedHandle) !== "detached") throw originalError;
    if (state.actionRecoveryUsed) {
      throw new Error(
        `stale_action_retry_exhausted: Element uid ${state.uid} was replaced again during ${action}. Take a fresh snapshot before retrying.`,
        { cause: originalError }
      );
    }
    state.actionRecoveryUsed = true;
    const actionStarted = observation.didStart();
    const recovered = action === "fill" ? await replaceWithSettledHandle(state) : await replaceCurrentHandle(state);
    if (action === "fill" && await intendedValueIsPresent(recovered, args[0])) {
      console.error(`[resume-companion] stale_action_already_applied uid=${state.uid} action=fill`);
      return void 0;
    }
    if (action === "click" && actionStarted) {
      throw new Error(
        `stale_action_result_unknown: Element uid ${state.uid} was replaced after the click began. Take a fresh snapshot and verify the page before retrying.`,
        { cause: originalError }
      );
    }
    console.error(`[resume-companion] stale_action_retry uid=${state.uid} action=${action}`);
    let retryLocator = locatorFrom(recovered, transforms);
    if (typeof retryLocator.setWaitForStableBoundingBox === "function") {
      retryLocator = Reflect.apply(retryLocator.setWaitForStableBoundingBox, retryLocator, [false]);
    }
    const retryMethod = retryLocator[action];
    if (typeof retryMethod !== "function") throw new Error(`stale_action_incompatible: Locator action ${action} is unavailable`);
    const retryObservation = observeLocatorAction(retryLocator);
    try {
      return await Reflect.apply(retryMethod, retryLocator, args);
    } catch (retryError) {
      const uncertain = action === "click" && retryObservation.didStart();
      throw new Error(
        uncertain ? `stale_action_result_unknown: Element uid ${state.uid} was replaced during the recovery click. Take a fresh snapshot and verify the page before retrying.` : `stale_action_retry_exhausted: Element uid ${state.uid} could not complete ${action} after one semantic recovery. Take a fresh snapshot before retrying.`,
        { cause: retryError }
      );
    } finally {
      retryObservation.stop();
    }
  } finally {
    observation.stop();
  }
}
function resilientLocator(state, transforms = []) {
  const chainMethods = /* @__PURE__ */ new Set([
    "setTimeout",
    "setVisibility",
    "setWaitForEnabled",
    "setEnsureElementIsInTheViewport",
    "setWaitForStableBoundingBox"
  ]);
  return new Proxy({}, {
    get(_target, property) {
      if (typeof property !== "string") return void 0;
      if (chainMethods.has(property)) {
        return (...args) => resilientLocator(state, [...transforms, { method: property, args }]);
      }
      if (property === "click" || property === "fill" || property === "hover") {
        return (...args) => runLocatorAction(state, transforms, property, args);
      }
      const locator = locatorFrom(state.current, transforms);
      const value = locator[property];
      return typeof value === "function" ? value.bind(locator) : value;
    }
  });
}
function resilientHandle(page, uid, expected, initial) {
  const initialHandle = initial;
  const state = {
    page,
    uid,
    expected,
    current: initialHandle,
    handles: /* @__PURE__ */ new Set([initialHandle]),
    readRecoveryUsed: false,
    actionRecoveryUsed: false
  };
  return new Proxy(initialHandle, {
    get(_target, property) {
      if (property === Symbol.dispose) {
        return () => {
          for (const handle of state.handles) handle[Symbol.dispose]?.();
        };
      }
      if (property === "asLocator") return () => resilientLocator(state);
      const current = state.current;
      const value = Reflect.get(current, property, current);
      if (property === "evaluate" && typeof value === "function") {
        return async (...args) => {
          const attemptedHandle = state.current;
          try {
            return await Reflect.apply(value, attemptedHandle, args);
          } catch (error2) {
            if (state.readRecoveryUsed || await handleConnectionState(attemptedHandle) !== "detached") throw error2;
            state.readRecoveryUsed = true;
            const recovered = await replaceCurrentHandle(state);
            const recoveredEvaluate = recovered.evaluate;
            if (!recoveredEvaluate) throw error2;
            return await Reflect.apply(recoveredEvaluate, recovered, args);
          }
        };
      }
      return typeof value === "function" ? value.bind(state.current) : value;
    }
  });
}
function installStaleUidRecovery(McpPage) {
  const prototype = McpPage.prototype;
  if (prototype[installedSymbol]) return;
  const original = prototype.getElementByUid;
  prototype.getElementByUid = async function getElementByUidWithRecovery(uid) {
    const snapshot = this.textSnapshot;
    const expected = snapshot ? pathForUid(snapshot.root, uid) : void 0;
    try {
      const handle = await original.call(this, uid);
      if (!expected) return handle;
      const state = await handleConnectionState(handle);
      if (state !== "detached") return resilientHandle(this, uid, expected, handle);
      handle[Symbol.dispose]?.();
      return resilientHandle(this, uid, expected, await recoverHandle(this, uid, expected));
    } catch (error2) {
      if (!expected || !isDetachedUidError(error2)) throw error2;
      return resilientHandle(this, uid, expected, await recoverHandle(this, uid, expected));
    }
  };
  prototype[installedSymbol] = true;
}

// src/browser/page-runtime.ts
function runtimeState(page) {
  return page.frames().map((frame, index) => ({
    frame: index,
    main: frame.mainRealm?.().hasContext?.() ?? true,
    utility: frame.isolatedRealm?.().hasContext?.() ?? true
  }));
}
async function ensurePageRuntime(page) {
  const missing = () => runtimeState(page).some((frame) => !frame.main || !frame.utility);
  if (!missing()) return;
  await new Promise((resolve5) => setTimeout(resolve5, 100));
  if (!missing()) return;
  const clients = /* @__PURE__ */ new Set();
  for (const frame of page.frames()) {
    if (frame.mainRealm?.().hasContext?.() === false || frame.isolatedRealm?.().hasContext?.() === false) {
      if (frame.client?.send) clients.add(frame.client);
    }
  }
  let timer;
  try {
    await Promise.race([
      (async () => {
        for (const client of clients) {
          await client.send("Runtime.disable");
          await client.send("Runtime.enable");
        }
        for (let attempt = 0; attempt < 20 && missing(); attempt++) {
          await new Promise((resolve5) => setTimeout(resolve5, 25));
        }
        if (missing()) throw new Error("execution contexts remain unavailable");
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("runtime resynchronization timed out")), 1500);
      })
    ]);
  } catch {
    throw new Error("page_context_unavailable: Browser execution contexts could not be synchronized. No input was dispatched. Preserve this tab and inspect browser runtime status before retrying; do not reload an unsaved form automatically.");
  } finally {
    clearTimeout(timer);
  }
}

// src/version.ts
import { readFileSync } from "node:fs";
import { dirname as dirname3, resolve as resolve3 } from "node:path";
import { fileURLToPath } from "node:url";
var PLUGIN_VERSION = "0.24.0";
var BROWSER_SUPERVISOR_PROTOCOL = 1;
function resolveRuntimePluginVersion(moduleUrl) {
  const directory = dirname3(fileURLToPath(moduleUrl));
  for (const manifest of [
    resolve3(directory, ".codex-plugin/plugin.json"),
    resolve3(directory, "../.codex-plugin/plugin.json")
  ]) {
    try {
      const value = JSON.parse(readFileSync(manifest, "utf8"));
      if (typeof value.version === "string" && value.version.trim()) return value.version.trim();
    } catch {
    }
  }
  return PLUGIN_VERSION;
}
var RUNTIME_PLUGIN_VERSION = resolveRuntimePluginVersion(import.meta.url);

// src/resume-browser-server.ts
var moduleDirectory = dirname4(fileURLToPath2(import.meta.url));
var runtimeEntry = process.env.RESUME_COMPANION_DEVTOOLS_RUNTIME ?? [
  resolve4(moduleDirectory, "runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js"),
  resolve4(moduleDirectory, "../runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js"),
  resolve4(moduleDirectory, "../../node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js")
].find(existsSync) ?? resolve4(moduleDirectory, "runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js");
var runtimeSource = resolve4(dirname4(runtimeEntry), "..");
function runtimeModule(path) {
  return pathToFileURL(resolve4(runtimeSource, path)).href;
}
var [browserModule, contextModule, pageModule, toolHandlerModule, toolsModule, thirdPartyModule] = await Promise.all([
  import(runtimeModule("browser.js")),
  import(runtimeModule("McpContext.js")),
  import(runtimeModule("McpPage.js")),
  import(runtimeModule("ToolHandler.js")),
  import(runtimeModule("tools/tools.js")),
  import(runtimeModule("third_party/index.js"))
]);
installStaleUidRecovery(pageModule.McpPage);
var profileDir = resolveChromeProfileDir();
var lock = new ChromeProfileLock(profileDir);
var upstreamArgs = {
  channel: "stable",
  userDataDir: profileDir,
  headless: process.env.RESUME_COMPANION_CHROME_HEADLESS === "1",
  usageStatistics: false,
  performanceCrux: false,
  redactNetworkHeaders: true,
  pageIdRouting: true,
  javascriptEvaluation: true,
  sourceMaps: true,
  experimentalStructuredContent: false,
  experimentalDataFormat: "default",
  experimentalDevtools: false,
  experimentalVision: false,
  experimentalIncludeAllPages: false,
  categoryInput: true,
  categoryNavigation: true,
  categoryNetwork: true,
  categoryDebugging: true,
  categoryEmulation: false,
  categoryPerformance: false,
  categoryMemory: false,
  categoryExtensions: false,
  categoryExperimentalThirdParty: false,
  categoryExperimentalWebmcp: false,
  categoryPwa: false,
  memoryDebugging: false,
  screenshotFormat: "webp",
  screenshotQuality: 80,
  screenshotMaxWidth: 1440,
  screenshotMaxHeight: 1200,
  chromeArg: [],
  ignoreDefaultChromeArg: [],
  slim: false,
  viaCli: false
};
var operationFields = {
  page_id: external_exports.number().int().positive().describe("\u76EE\u6807\u9875\u9762 ID\u3002\u4F7F\u7528 list_pages \u83B7\u53D6\u3002"),
  expected_generation: external_exports.number().int().positive().optional().describe("\u53EF\u9009\u7684\u89C2\u5BDF generation\uFF1B\u4E0D\u4E00\u81F4\u65F6\u505C\u6B62\u3002"),
  operation_id: external_exports.string().min(4).max(120).optional().describe("\u53EF\u9009\u5E42\u7B49 ID\uFF1B\u540C\u4E00\u8FDB\u7A0B\u5185\u91CD\u590D\u8C03\u7528\u8FD4\u56DE\u7B2C\u4E00\u6B21\u7ED3\u679C\u3002"),
  test_mode: external_exports.boolean().optional().describe("\u8BB0\u5F55\u672C\u6B21\u6D4B\u8BD5\u64CD\u4F5C\u6E05\u5355\uFF0C\u4E0D\u5199\u5165\u957F\u671F\u8D44\u6599\u5E93\u3002")
};
var batchField = external_exports.object({ field: external_exports.string().min(1).max(240), value: external_exports.union([external_exports.string().max(2e4), external_exports.boolean(), external_exports.number()]), overwrite: external_exports.boolean().optional() });
var batchSteps = external_exports.array(external_exports.discriminatedUnion("action", [
  external_exports.object({ action: external_exports.literal("fill"), fields: external_exports.array(batchField).min(1).max(30) }),
  external_exports.object({ action: external_exports.literal("select"), field: external_exports.string().min(1).max(240), value: external_exports.string().max(500).optional(), values: external_exports.array(external_exports.string().min(1).max(500)).max(40).optional(), selection_mode: external_exports.enum(["add", "replace"]).optional(), query: external_exports.string().max(500).optional(), allow_custom: external_exports.boolean().optional(), overwrite: external_exports.boolean().optional() }),
  external_exports.object({ action: external_exports.literal("date"), field: external_exports.string().min(1).max(240), value: external_exports.string().max(80).optional(), range: external_exports.object({ start: external_exports.string().min(4).max(10), end: external_exports.string().min(4).max(10).optional(), current: external_exports.boolean().optional() }).optional(), overwrite: external_exports.boolean().optional() })
])).min(1).max(16);
var snapshotBearingTools = /* @__PURE__ */ new Set(["take_snapshot", "wait_for", "fill", "fill_form", "click", "hover", "press_key", "type_text"]);
var ledgerAwareLowLevelTools = /* @__PURE__ */ new Set(["fill", "fill_form", "click", "hover", "press_key", "type_text", "upload_file"]);
function sanitizeBrowserResult(value) {
  if (typeof value === "string") return redactBrowserText(value);
  if (Array.isArray(value)) return value.map(sanitizeBrowserResult);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key2, item]) => [key2, key2 === "data" ? item : sanitizeBrowserResult(item)]));
}
function annotateTimeout(result, toolName) {
  const text3 = Array.isArray(result?.content) ? result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n") : "";
  if (toolName === "navigate_page" && /Unable to (?:reload|navigate)/.test(text3)) {
    const cancelled = /Dismissed a beforeunload dialog/.test(text3);
    result = { ...result, isError: true, structuredContent: { ok: false, error: {
      code: cancelled ? "navigation_cancelled" : "navigation_failed",
      message: cancelled ? "Navigation was cancelled by dismissing beforeunload; the page was not reloaded." : "Navigation did not complete; inspect the current page before retrying.",
      recovery: "preserve_unsaved_page"
    } } };
  }
  if (!result?.isError || !/timed out after waiting \d+ms|timeout/i.test(text3)) return result;
  const phase = ["fill", "fill_form", "click", "hover", "press_key", "type_text"].includes(toolName) ? "element_locator_or_event_confirmation" : toolName === "take_screenshot" ? "screenshot_capture" : "upstream_page_operation";
  const note = `ApplyMCP: timeout_phase=${phase}; preserve_unsaved_page=true; inspect runtime status or re-observe before retrying. Never repeat an unconfirmed write or reload an unsaved form automatically.`;
  return {
    ...result,
    content: [...result.content ?? [], { type: "text", text: note }]
  };
}
var ResumeBrowserHost = class {
  presentation = new PagePresentation();
  runner = new FormRunner();
  journeys = new FormJourney();
  preparedPlans = new PreparedPlans();
  profiles = new ProfileStore();
  mutex = new thirdPartyModule.Mutex();
  unlockedMutex = { acquire: async () => ({ [Symbol.dispose]: () => void 0 }) };
  browser;
  context;
  engine;
  debugBridge;
  lockHeld = false;
  closing = false;
  leaseOwner;
  revokedSessions = /* @__PURE__ */ new Set();
  async run(sessionId, callback, signal, runId, journeyId) {
    signal?.throwIfAborted();
    if (this.runner.activeId && this.runner.activeId !== runId || this.journeys.activeId && this.journeys.activeId !== journeyId) throw new Error("run_in_progress");
    const guard = await this.mutex.acquire();
    try {
      signal?.throwIfAborted();
      if (this.runner.activeId && this.runner.activeId !== runId || this.journeys.activeId && this.journeys.activeId !== journeyId) throw new Error("run_in_progress");
      this.claimUnsafe(sessionId);
      return await callback();
    } finally {
      guard[Symbol.dispose]();
    }
  }
  async handleForm(sessionId, pageId, callback, signal) {
    try {
      return await this.run(sessionId, async () => {
        const context = await this.getContext();
        await ensurePageRuntime(context.getPageById(pageId).pptrPage);
        if (!this.engine) this.engine = new FormEngine((id3) => context.getPageById(id3), assertSupportedForm);
        return await callback(this.engine);
      }, signal);
    } catch (error2) {
      return browserErrorResult(error2);
    }
  }
  async handlePrepare(sessionId, params, signal) {
    const respond = (data) => ({ content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data });
    if (params.action === "inspect") {
      try {
        return respond({ ok: true, prepared_plan_id: params.prepared_plan_id, ...preparationSummary(this.preparedPlans.get(sessionId, params.prepared_plan_id).compilation, params.offset ?? 0, params.limit ?? 20) });
      } catch (error2) {
        return browserErrorResult(error2);
      }
    }
    if (!params.page_id || !params.profile_id || !params.expected_revision) return browserErrorResult(new Error("invalid_arguments"));
    return this.handleForm(sessionId, params.page_id, async (engine) => {
      const started = Date.now();
      const profile = await this.profiles.readForPlanning(params.profile_id, params.expected_revision);
      let catalog = await engine.capturePlanning(params.page_id, signal);
      for (let attempt = 0; !catalog.raw.fields.length && attempt < 8; attempt++) {
        await pause(250, void 0, { signal });
        catalog = await engine.capturePlanning(params.page_id, signal);
      }
      const support = inspectSupport(catalog.raw);
      if (!support.autofill_allowed) return respond({ ok: true, status: "unsupported", support, prepare_ms: Date.now() - started });
      const compilation = compilePlan(catalog, profile, policySchema.parse(params.policy), params.test_mode);
      const entry = compilation.plan ? this.preparedPlans.put(sessionId, profile.profile_id, profile.revision, catalog.raw, compilation) : void 0;
      return respond({ ok: true, status: entry ? "prepared" : "needs_input", support, ...entry ? { prepared_plan_id: entry.id, expires_in_ms: 6e5 } : {}, profile_revision: profile.revision, prepare_ms: Date.now() - started, ...preparationSummary(compilation) });
    }, signal);
  }
  async handleJourney(sessionId, params, signal) {
    const respond = (data) => {
      const report = executionReport(data, params);
      return { content: [{ type: "text", text: JSON.stringify(report) }], structuredContent: report };
    };
    try {
      if (params.expected_report_id && params.action !== "status") throw new Error("invalid_arguments");
      if (params.action === "status") return respond(this.journeys.status(sessionId, params.journey_id, params.resume_token));
      if (params.action === "cancel") return respond(this.journeys.cancel(sessionId, params.journey_id, params.resume_token));
      if (params.action === "start") {
        if (!params.page_id || !params.profile_id || !params.expected_revision || !params.request_id) throw new Error("invalid_arguments");
        return this.handleForm(sessionId, params.page_id, async (engine) => {
          await this.profiles.readForPlanning(params.profile_id, params.expected_revision);
          const { raw } = await engine.captureRun(params.page_id, signal);
          return respond(this.journeys.start(sessionId, params.request_id, { pageId: params.page_id, profileId: params.profile_id, revision: params.expected_revision, policy: policySchema.parse(params.policy), testMode: params.test_mode }, raw));
        }, signal);
      }
      if (!params.journey_id || this.leaseOwner !== sessionId) throw new Error("browser_takeover_required");
      const pageId = this.journeys.page(sessionId, params.journey_id, params.resume_token);
      return await this.run(sessionId, async () => {
        const context = await this.getContext();
        await ensurePageRuntime(context.getPageById(pageId).pptrPage);
        if (!this.engine) this.engine = new FormEngine((id3) => context.getPageById(id3), assertSupportedForm);
        return respond(await this.journeys.execute(sessionId, params.journey_id, this.engine, (id3, revision) => this.profiles.readForPlanning(id3, revision), signal));
      }, signal, void 0, params.journey_id);
    } catch (error2) {
      return browserErrorResult(error2);
    }
  }
  recordLowLevelOperation(pageId, action, operationId, target, resultName, scope, elapsedMs) {
    this.engine?.recordLowLevelOperation(pageId, action, operationId, target, resultName, scope, elapsedMs);
  }
  /** Called only inside run(), so the lease and mutex already fence writes. */
  async requireSupportedPage(pageId) {
    const context = await this.getContext();
    if (!this.engine) this.engine = new FormEngine((id3) => context.getPageById(id3), assertSupportedForm);
    const { raw } = await this.engine.captureRun(pageId);
    assertSupportedForm(raw);
  }
  async handleRun(sessionId, params, signal, progress) {
    const response = (data) => {
      const report = executionReport(data, params);
      return {
        content: [{ type: "text", text: JSON.stringify(report) }],
        structuredContent: report,
        ...report.error && !report.run_id ? { isError: true } : {}
      };
    };
    let prepared = {};
    try {
      if (params.expected_report_id && params.action !== "status") throw new Error("invalid_arguments");
      if (params.action === "status") return response(this.runner.status(sessionId, params.run_id, params.resume_token));
      if (params.action === "cancel") return response(this.runner.cancel(sessionId, params.run_id, params.resume_token));
      if (params.action === "start") {
        if (!params.request_id || Boolean(params.plan) === Boolean(params.prepared_plan_id) || params.run_id || params.revision) throw new Error("invalid_arguments");
        if (params.prepared_plan_id) {
          if (this.leaseOwner !== sessionId) throw new Error("browser_takeover_required");
          const entry = this.preparedPlans.get(sessionId, params.prepared_plan_id);
          if (entry.requestId && entry.requestId !== params.request_id) throw new Error("prepared_plan_already_started");
          await this.profiles.readForPlanning(entry.profileId, entry.revision);
          prepared = this.runner.start(sessionId, params.request_id, entry.plan);
          if (prepared.created) {
            entry.requestId = params.request_id;
            entry.runId = prepared.run_id;
            this.runner.markPrepared(sessionId, prepared.run_id);
            this.runner.setDerivedEffects(sessionId, prepared.run_id, entry.compilation.derived_effects ?? []);
            this.runner.setGuard(sessionId, prepared.run_id, async (raw, first) => {
              assertSupportedForm(raw);
              await this.profiles.readForPlanning(entry.profileId, entry.revision);
              if (first && catalogDigest(raw) !== entry.digest) throw new Error("prepared_page_changed");
            });
          }
        } else prepared = this.runner.start(sessionId, params.request_id, params.plan);
        if (!prepared.created) return response(prepared);
        if (params.defer_execution ?? Boolean(params.prepared_plan_id)) return response(prepared);
      } else {
        if (!params.run_id || params.plan || params.prepared_plan_id || params.request_id || params.defer_execution) throw new Error("invalid_arguments");
        if (this.leaseOwner !== sessionId) throw new Error("browser_takeover_required");
        prepared = this.runner.resume(sessionId, params.run_id, params.resume_token, params.revision);
        if (prepared.status !== "ready") return response(prepared);
      }
      const runId = prepared.run_id;
      const result = await this.run(sessionId, async () => {
        const context = await this.getContext();
        const pageId = params.plan?.page_id;
        if (typeof pageId === "number") await ensurePageRuntime(context.getPageById(pageId).pptrPage);
        if (!this.engine) this.engine = new FormEngine((id3) => context.getPageById(id3), assertSupportedForm);
        return await this.runner.executeWindow(sessionId, runId, this.engine, signal, 9e4, progress);
      }, signal, runId);
      return response({ ...result, ...prepared.resume_token ? { resume_token: prepared.resume_token } : {} });
    } catch (error2) {
      if (prepared.run_id && prepared.status === "ready" && this.runner.activeId === prepared.run_id) this.runner.cancel(sessionId, prepared.run_id);
      return browserErrorResult(error2);
    }
  }
  releaseSession(sessionId) {
    this.presentation.clearOwner(sessionId);
    this.runner.cancelOwner(sessionId);
    this.journeys.cancelOwner(sessionId);
    this.preparedPlans.clearOwner(sessionId);
    if (this.leaseOwner === sessionId) this.leaseOwner = void 0;
    this.revokedSessions.delete(sessionId);
  }
  async takeover(sessionId) {
    this.runner.cancelActive();
    if (this.leaseOwner) this.journeys.cancelOwner(this.leaseOwner);
    this.preparedPlans.clear();
    const guard = await this.mutex.acquire();
    try {
      const previousOwner = this.leaseOwner;
      if (previousOwner && previousOwner !== sessionId) this.revokedSessions.add(previousOwner);
      this.revokedSessions.delete(sessionId);
      this.leaseOwner = sessionId;
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true, status: previousOwner && previousOwner !== sessionId ? "taken_over" : "already_owner" }) }],
        structuredContent: { ok: true, status: previousOwner && previousOwner !== sessionId ? "taken_over" : "already_owner" }
      };
    } finally {
      guard[Symbol.dispose]();
    }
  }
  async close() {
    if (this.closing) return;
    this.closing = true;
    this.runner.clear();
    this.journeys.clear();
    this.preparedPlans.clear();
    this.engine?.clear();
    await this.debugBridge?.close();
    this.debugBridge = void 0;
    this.context?.dispose?.();
    this.context = void 0;
    this.engine = void 0;
    try {
      await browserModule.closeBrowser();
    } finally {
      if (this.lockHeld) await lock.release();
      this.lockHeld = false;
    }
  }
  async getContext() {
    if (!this.lockHeld) {
      await lock.acquire();
      this.lockHeld = true;
    }
    const browser = await browserModule.ensureBrowserLaunched({
      headless: upstreamArgs.headless,
      channel: upstreamArgs.channel,
      isolated: false,
      userDataDir: upstreamArgs.userDataDir,
      chromeArgs: upstreamArgs.chromeArg,
      ignoreDefaultChromeArgs: upstreamArgs.ignoreDefaultChromeArg,
      devtools: false,
      enableExtensions: false,
      blocklist: void 0,
      allowlist: void 0
    });
    if (this.browser !== browser || !this.context) {
      if (this.engine) {
        this.runner.clear();
        this.journeys.clear();
      }
      this.context?.dispose?.();
      this.engine?.clear();
      this.browser = browser;
      this.context = await contextModule.McpContext.from(browser, void 0, {
        experimentalDevToolsDebugging: false,
        experimentalIncludeAllPages: false,
        performanceCrux: false,
        sourceMaps: true,
        allowList: void 0,
        blocklist: void 0,
        allowUnrestrictedPaths: false,
        reconnected: this.context !== void 0,
        categoryExtensions: false
      });
      const context = this.context;
      if (!context) throw new Error("browser_context_unavailable");
      this.engine = new FormEngine((id3) => context.getPageById(id3), assertSupportedForm);
      await this.debugBridge?.close();
      this.debugBridge = new BrowserDebugBridge(profileDir, (request) => this.handleDebugRequest(request));
      await this.debugBridge.start();
      console.error(`Resume Browser read-only debug socket ready at ${this.debugBridge.endpoint}`);
    }
    if (!this.context) throw new Error("browser_context_unavailable");
    return this.context;
  }
  claimUnsafe(sessionId) {
    if (this.revokedSessions.has(sessionId)) {
      throw new Error("browser_lease_revoked: \u8FD9\u4E2A\u4EFB\u52A1\u7684\u6D4F\u89C8\u5668\u63A7\u5236\u6743\u5DF2\u7531\u66F4\u65B0\u7684\u4EFB\u52A1\u63A5\u7BA1\uFF1B\u8BF7\u5728\u5F53\u524D\u4EFB\u52A1\u660E\u786E\u8BF7\u6C42\u91CD\u65B0\u63A5\u7BA1\u6216\u7EE7\u7EED\u4F7F\u7528\u65B0\u4EFB\u52A1");
    }
    if (this.leaseOwner && this.leaseOwner !== sessionId) {
      this.revokedSessions.add(this.leaseOwner);
      this.preparedPlans.clearOwner(this.leaseOwner);
    }
    this.leaseOwner = sessionId;
  }
  async handleDebugRequest(request) {
    const guard = await this.mutex.acquire();
    try {
      const context = this.context;
      const engine = this.engine;
      if (!context || !engine) throw new Error("browser_context_unavailable");
      if (request.command === "status") {
        return { version: RUNTIME_PLUGIN_VERSION, pid: process.pid, profile_hash: profileHash(profileDir), pages: context.getPages().length, lease_active: Boolean(this.leaseOwner) };
      }
      if (request.command === "runtime_status") {
        const page = context.getPageById(Number(request.page_id));
        return { page_id: page.id, frames: runtimeState(page.pptrPage) };
      }
      if (request.command === "list_pages") {
        const pages = await Promise.all(context.getPages().map(async (page) => ({
          page_id: page.id,
          title: String(await page.pptrPage.title()).slice(0, 200),
          url: redactDiagnostic(String(page.pptrPage.url()))
        })));
        return { pages };
      }
      if (request.command === "observe") {
        const pageId = Number(request.page_id);
        if (!Number.isInteger(pageId) || pageId <= 0) throw new Error("invalid page_id");
        context.getPageById(pageId);
        const mode = request.mode === "focus" || request.mode === "delta" || request.mode === "full" ? request.mode : "overview";
        const includeValues = request.include_values === "masked" || request.include_values === "needed" ? request.include_values : "state";
        const result = await engine.observe({
          page_id: pageId,
          mode,
          ...typeof request.target === "string" ? { target: request.target } : {},
          ...typeof request.scope === "string" ? { scope: request.scope } : {},
          ...typeof request.since_observation_id === "string" ? { since_observation_id: request.since_observation_id } : {},
          max_bytes: typeof request.max_bytes === "number" ? Math.min(request.max_bytes, 2e4) : 8e3,
          include_values: includeValues,
          include_test_ledger: Boolean(request.include_test_ledger)
        });
        return result.structuredContent ?? result;
      }
      throw new Error("unsupported debug command; use status, runtime_status, list_pages, or observe");
    } finally {
      guard[Symbol.dispose]();
    }
  }
};
var ResumeBrowserServer = class _ResumeBrowserServer {
  constructor(host2, sessionId) {
    this.host = host2;
    this.sessionId = sessionId;
    this.server = new thirdPartyModule.McpServer({
      name: "resume_browser",
      title: "ApplyMCP Browser",
      version: RUNTIME_PLUGIN_VERSION
    }, { capabilities: { logging: {} } });
  }
  host;
  sessionId;
  server;
  closing = false;
  static async create(host2 = new ResumeBrowserHost(), sessionId = randomUUID8()) {
    const instance = new _ResumeBrowserServer(host2, sessionId);
    instance.registerUpstreamTools();
    instance.registerFormTools();
    return instance;
  }
  async connect(transport = new thirdPartyModule.StdioServerTransport()) {
    await this.server.connect(transport);
    console.error(`ApplyMCP Browser ${RUNTIME_PLUGIN_VERSION} session ready; Chrome profile ${profileHash(profileDir)} is acquired on first browser call.`);
  }
  async close() {
    if (this.closing) return;
    this.closing = true;
    this.host.releaseSession(this.sessionId);
    await this.server.close().catch(() => void 0);
  }
  registerUpstreamTools() {
    const blocked = /* @__PURE__ */ new Set(["lighthouse_audit"]);
    for (const tool of toolsModule.createTools(upstreamArgs)) {
      if (blocked.has(tool.name)) continue;
      const guardedTool = tool.name === "click" ? { ...tool, handler: async (request, response) => {
        const deadline = Date.now() + 1500;
        for (; ; ) {
          const handle = await request.page.getElementByUid(request.params.uid);
          try {
            await preparePointerTarget(handle);
            break;
          } catch (error2) {
            if (!(error2 instanceof Error) || !error2.message.includes("target_detached_before_click") || Date.now() >= deadline) throw error2;
            await new Promise((resolve5) => setTimeout(resolve5, 50));
          } finally {
            await handle.dispose();
          }
        }
        return tool.handler(request, response);
      } } : tool.name === "upload_file" ? { ...tool, handler: async (request, response) => {
        const handle = await request.page.getElementByUid(request.params.uid);
        try {
          if (!await handle.evaluate((el) => el instanceof HTMLInputElement && el.type === "file" && !el.disabled)) throw new Error("upload_target_not_file_input");
          await handle.uploadFile(...request.params.filePaths);
          response.appendResponseLine("Authorized files selected in the file input; server upload is not confirmed.");
          if (request.params.includeSnapshot) response.includeSnapshot();
        } finally {
          await handle.dispose();
        }
      } } : tool;
      const handler = new toolHandlerModule.ToolHandler(guardedTool, upstreamArgs, () => this.host.getContext(), this.host.unlockedMutex);
      if (!handler.shouldRegister) continue;
      if (tool.name === "select_page" || tool.name === "new_page") {
        handler.inputSchema = {
          ...handler.inputSchema,
          ...tool.name === "select_page" ? { bringToFront: external_exports.boolean().default(false) } : { background: external_exports.boolean().default(true) },
          attention_reason: external_exports.enum(["user_request", "manual_action", "error", "completed"]).optional().describe("Required only when bringing the dedicated browser to the foreground."),
          attention_event_id: external_exports.string().min(1).max(120).optional().describe("Stable ID for this pause/error/completion; repeating it does not focus the window again. Not required for an explicit user request.")
        };
        handler.registeredInputSchema = external_exports.object(handler.inputSchema).passthrough();
      }
      if (ledgerAwareLowLevelTools.has(tool.name)) {
        handler.inputSchema = {
          ...handler.inputSchema,
          operation_id: external_exports.string().min(4).max(120).optional().describe("\u53EF\u9009\u7684\u6D4B\u8BD5\u64CD\u4F5C\u5173\u8054 ID\u3002"),
          test_mode: external_exports.boolean().optional().describe("\u628A\u8FD9\u6B21\u4F4E\u5C42\u56DE\u9000\u8BB0\u5165\u77ED\u671F\u6D4B\u8BD5\u6E05\u5355\uFF1B\u5B57\u6BB5\u8BED\u4E49\u548C\u6E05\u7406\u72B6\u6001\u4ECD\u6807\u8BB0\u4E3A\u672A\u9A8C\u8BC1\u3002"),
          semantic_target: external_exports.string().max(240).optional().describe("\u6D4B\u8BD5\u56DE\u9000\u5BF9\u5E94\u7684\u5B57\u6BB5\u5F15\u7528\u6216\u6807\u7B7E\uFF0C\u53EA\u7528\u4E8E\u8BB0\u5F55\uFF0C\u4E0D\u80FD\u66FF\u4EE3\u5B9E\u9645 UID\u3002"),
          semantic_scope: external_exports.string().max(240).optional()
        };
        handler.registeredInputSchema = external_exports.object(handler.inputSchema).passthrough();
      }
      if (tool.name === "upload_file") {
        handler.inputSchema = { ...handler.inputSchema, user_authorized: external_exports.boolean().default(false).describe("Only true after the user explicitly authorizes these files and this destination. A general autofill request does not authorize uploading.") };
        handler.registeredInputSchema = external_exports.object(handler.inputSchema).passthrough();
      }
      if (tool.name === "evaluate_script") {
        handler.inputSchema = {
          ...handler.inputSchema,
          args: external_exports.array(external_exports.string()).optional().describe("Element UIDs from the latest accessibility snapshot. Each string is resolved to a DOM element; ordinary JSON/string values are not supported. For literal values, include JSON literals in the function body.")
        };
        handler.registeredInputSchema = external_exports.object(handler.inputSchema).passthrough();
      }
      this.server.registerTool(tool.name, {
        description: tool.name === "upload_file" ? "Normal mode requires the user to upload files in the dedicated browser. The tool is retained only for isolated local fixtures with explicit authorization." : tool.name === "evaluate_script" ? "Arbitrary scripts are disabled in normal mode. Use form_observe or take_snapshot. Only isolated local developer fixtures can enable this tool." : tool.description,
        inputSchema: handler.registeredInputSchema,
        annotations: tool.annotations
      }, async (params) => {
        try {
          return await this.host.run(this.sessionId, async () => {
            const startedAt = Date.now();
            if (tool.name === "upload_file") {
              if (!params.user_authorized) return { isError: true, content: [{ type: "text", text: "manual_boundary: uploading requires explicit user authorization for the file and destination." }] };
            }
            if (ledgerAwareLowLevelTools.has(tool.name) || ["evaluate_script", "drag", "click_at"].includes(tool.name)) {
              const context = await this.host.getContext();
              const page = typeof params.pageId === "number" ? context.getPageById(params.pageId) : context.getSelectedPageFallback();
              await ensurePageRuntime(page.pptrPage);
              await guardLowLevelAction(tool.name, params, page);
              await this.host.requireSupportedPage(page.id);
            }
            let result = await this.host.presentation.run(tool.name, params, this.sessionId, (p) => handler.handle(p));
            result = annotateTimeout(result, tool.name);
            if (snapshotBearingTools.has(tool.name)) result = sanitizeBrowserResult(result);
            if (params.test_mode && typeof params.pageId === "number") {
              this.host.recordLowLevelOperation(
                params.pageId,
                tool.name,
                params.operation_id,
                params.semantic_target ?? (typeof params.uid === "string" ? params.uid : Array.isArray(params.elements) ? `${params.elements.length} elements` : "keyboard_or_pointer_target"),
                result?.isError ? "failed_or_partial" : "completed_unverified",
                params.semantic_scope,
                Date.now() - startedAt
              );
            }
            return result;
          });
        } catch (error2) {
          return browserErrorResult(error2);
        }
      });
    }
  }
  registerFormTools() {
    const reportFields = { detail: external_exports.enum(reportDetails).default("summary").describe("Summary and exceptions by default. Read a collection through status with offset/limit. full is an explicit compatibility/diagnostic view."), offset: external_exports.number().int().nonnegative().default(0), limit: external_exports.number().int().min(1).max(50).default(20), expected_report_id: external_exports.string().max(64).optional().describe("Pin pagination to an unchanged report; allowed only for status.") };
    this.server.registerTool("form_support", {
      description: "Read-only support and compatibility scan before filling. Omit page_ids to list trusted ATS platforms, verified employer templates and evidence; otherwise inspect up to 12 open pages. A trusted page whose form has not mounted gets one short read-only retry. A trusted platform origin must also match its structural form family. Reports verified-template vs compatible-platform matches, live modules, fillable/skipped modules, blocking/advisory differences and manual tasks. Unsupported or candidate pages are not written.",
      inputSchema: { page_ids: external_exports.array(external_exports.number().int().positive()).min(1).max(12).optional() },
      annotations: { readOnlyHint: true }
    }, async (params, extra) => {
      const pages = [];
      for (const pageId of [...new Set(params.page_ids ?? [])]) {
        const result = await this.host.handleForm(this.sessionId, pageId, async (engine) => {
          let { raw } = await engine.captureRun(pageId, extra.signal);
          let support = inspectSupport(raw);
          if (support.status === "not_resume_form" && (support.template || support.platform)) {
            await pause(400, void 0, { signal: extra.signal });
            ({ raw } = await engine.captureRun(pageId, extra.signal));
            support = inspectSupport(raw);
          }
          return { page_id: pageId, support };
        }, extra.signal);
        pages.push(result);
      }
      const data = params.page_ids ? { catalog_version: capabilityCatalog().catalog_version, pages } : capabilityCatalog();
      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
    });
    this.server.registerTool("form_journey", {
      description: "Foreground resume workflow for 51job pages and Guopin module editors. Guopin fills and saves one editor at a time, verifies saved record anchors, preserves existing records, and requires append policy when adding alongside pre-existing records. start is read-only and returns a recovery token; resume compiles and verifies each current page locally, then advances confirmed ordinary Next steps. Next may save that page. Stops at missing facts, unsupported controls, declarations, uploads (except an explicitly optional attachment skip), or final review. Never submits an application or replays an uncertain Next. status/cancel remain available while working. A new connection needs explicit browser_takeover and the resume_token. Process-local checkpoints expire after 30 minutes; browser/service restart requires a new journey.",
      inputSchema: { ...reportFields, action: external_exports.enum(["start", "resume", "status", "cancel"]), request_id: external_exports.string().min(4).max(120).optional(), page_id: external_exports.number().int().positive().optional(), profile_id: external_exports.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(), expected_revision: external_exports.number().int().positive().optional(), policy: policySchema, test_mode: external_exports.boolean().default(false), journey_id: external_exports.string().max(120).optional(), resume_token: external_exports.string().max(200).optional() },
      annotations: { readOnlyHint: false, destructiveHint: false }
    }, async (params, extra) => this.host.handleJourney(this.sessionId, params, extra.signal));
    this.server.registerTool("form_prepare", {
      description: "Read-only local preparation of a complete resume plan from a pinned profile revision and the full live form. Does not open controls or write fields. Intersects live page modules with provided/none/unknown profile sections and returns module_selection plus profile-only sections. Omitted sections remain unknown; only explicit none permits negative answers. Returns a bounded summary and prepared_plan_id; form_run start accepts that ID and defaults to deferred execution. Inspect pages through action=inspect without reobserving. Plans expire after 10 minutes or lease/connection loss.",
      inputSchema: { action: external_exports.enum(["prepare", "inspect"]).default("prepare"), page_id: external_exports.number().int().positive().optional(), profile_id: external_exports.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(), expected_revision: external_exports.number().int().positive().optional(), policy: policySchema, test_mode: external_exports.boolean().default(false), prepared_plan_id: external_exports.string().max(120).optional(), offset: external_exports.number().int().nonnegative().default(0), limit: external_exports.number().int().min(1).max(20).default(20) },
      annotations: { readOnlyHint: true, destructiveHint: false }
    }, async (params, extra) => this.host.handlePrepare(this.sessionId, params, extra.signal));
    this.server.registerTool("form_run", {
      description: "Execute a whole-form plan in a cancellable foreground window. Prefer prepared_plan_id from form_prepare (defaults to deferred start); alternatively pass an explicit plan. Exactly one is required. start validates the entire plan before writing. paused_window resumes by run_id without replay. status/cancel do not wait for browser actions. No save/submit/upload. UI verification is not persistence. A restarted connection needs the resume_token plus explicit browser_takeover before resume.",
      inputSchema: {
        ...reportFields,
        action: external_exports.enum(["start", "status", "cancel", "resume"]),
        request_id: external_exports.string().min(4).max(120).optional(),
        plan: formPlanSchema.optional(),
        prepared_plan_id: external_exports.string().max(120).optional(),
        defer_execution: external_exports.boolean().optional().describe("On start, register without writing and return recovery credentials before the first execution window. Continue with resume. Recommended when connection recovery matters."),
        run_id: external_exports.string().min(1).max(120).optional(),
        resume_token: external_exports.string().max(200).optional(),
        revision: external_exports.object({ facts: external_exports.record(factSchema).optional(), retry_steps: external_exports.array(external_exports.string().max(120)).max(500).optional() }).strict().optional()
      },
      annotations: { readOnlyHint: false, destructiveHint: false }
    }, async (params, extra) => this.host.handleRun(
      this.sessionId,
      params,
      extra.signal,
      extra._meta?.progressToken === void 0 ? void 0 : (progress, total) => {
        void extra.sendNotification({ method: "notifications/progress", params: { progressToken: extra._meta.progressToken, progress, total } }).catch(() => {
        });
      }
    ));
    this.server.registerTool("browser_takeover", {
      description: "Explicitly reclaim the shared ApplyMCP browser lease for this task. The previously controlling task remains open but its browser calls are revoked.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
    }, async () => await this.host.takeover(this.sessionId));
    this.server.registerTool("form_observe", {
      description: "Observe a recruitment form with local semantic caching. date_group fields combine split year/month selects or a named UD month range; target the group with form_set_date instead of selecting each part. Focused results expose local details and a value-free sentinel for changes elsewhere; full mode is explicit.",
      inputSchema: {
        page_id: external_exports.number().int().positive(),
        mode: external_exports.enum(["overview", "focus", "delta", "full"]).default("overview"),
        target: external_exports.string().max(200).optional(),
        scope: external_exports.string().max(200).optional(),
        since_observation_id: external_exports.string().max(120).optional(),
        max_bytes: external_exports.number().int().min(2e3).max(8e4).optional(),
        include_values: external_exports.enum(["state", "masked", "needed"]).optional(),
        include_test_ledger: external_exports.boolean().optional(),
        cursor: external_exports.string().max(160).optional().describe("Continue the frozen field catalog using coverage.next_cursor; invalid after writes/navigation."),
        ledger_cursor: external_exports.number().int().nonnegative().optional(),
        ledger_limit: external_exports.number().int().min(0).max(25).optional().describe("0/default returns run counts only; request details explicitly, independently of fields.")
      },
      annotations: { readOnlyHint: true }
    }, async (params) => await this.host.handleForm(this.sessionId, params.page_id, (engine) => engine.observe(params)));
    this.server.registerTool("form_fill_fields", {
      description: "Fill ordinary fields, OR execute 1\u201316 preplanned fill/select/date steps in one observed record scope. Steps run sequentially with fresh generations, stop on uncertainty/conflict, and recheck values at the end. No add/save/submit steps. Provide exactly fields or steps; scope is required for steps. Retry uncertain transport with the same operation_id.",
      inputSchema: {
        ...operationFields,
        fields: external_exports.array(external_exports.object({
          field: external_exports.string().min(1).max(240),
          scope: external_exports.string().max(240).optional(),
          value: external_exports.union([external_exports.string().max(2e4), external_exports.boolean(), external_exports.number()]),
          overwrite: external_exports.boolean().optional()
        })).min(1).max(80).optional(),
        scope: external_exports.string().min(1).max(240).optional(),
        steps: batchSteps.optional()
      },
      annotations: { readOnlyHint: false }
    }, async (params, extra) => await this.host.handleForm(this.sessionId, params.page_id, async (engine) => {
      if (Boolean(params.fields) === Boolean(params.steps) || params.steps && !params.scope) return { isError: true, content: [{ type: "text", text: "Provide exactly fields or steps; steps require scope." }] };
      if (params.steps) return engine.executeBatch({ pageId: params.page_id, signal: extra.signal, expectedGeneration: params.expected_generation, operationId: params.operation_id, testMode: params.test_mode, scope: params.scope, steps: params.steps });
      return engine.fillFields({
        pageId: params.page_id,
        signal: extra.signal,
        expectedGeneration: params.expected_generation,
        operationId: params.operation_id,
        testMode: params.test_mode,
        fields: params.fields.map((field) => ({ ...field, scope: field.scope ?? params.scope }))
      });
    }, extra.signal));
    this.server.registerTool("form_select_option", {
      description: "Select one option with value, or a supported multiple Select set with values. Add preserves existing choices; replace requires authorized overwrite. Verify UI state, not persistence.",
      inputSchema: {
        ...operationFields,
        field: external_exports.string().min(1).max(240),
        value: external_exports.string().min(1).max(500).optional(),
        values: external_exports.array(external_exports.string().min(1).max(500)).max(80).optional(),
        selection_mode: external_exports.enum(["add", "replace"]).optional(),
        scope: external_exports.string().max(240).optional(),
        query: external_exports.string().max(500).optional(),
        allow_custom: external_exports.boolean().optional().describe("Allow the exact supplied name through an observed local custom-school/major option. Does not authorize creating records or submitting."),
        overwrite: external_exports.boolean().optional()
      },
      annotations: { readOnlyHint: false }
    }, async (params, extra) => await this.host.handleForm(this.sessionId, params.page_id, (engine) => engine.selectOption({
      pageId: params.page_id,
      signal: extra.signal,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      field: params.field,
      value: params.value ?? "",
      values: params.values,
      selectionMode: params.selection_mode,
      scope: params.scope,
      query: params.query,
      allowCustom: params.allow_custom,
      overwrite: params.overwrite
    }), extra.signal));
    this.server.registerTool("form_select_path", {
      description: "Complete a cascader or tree path inside one MCP transaction without returning intermediate full-page snapshots.",
      inputSchema: {
        ...operationFields,
        field: external_exports.string().min(1).max(240),
        path: external_exports.array(external_exports.string().min(1).max(500)).min(1).max(12),
        overwrite: external_exports.boolean().optional(),
        scope: external_exports.string().max(240).optional()
      },
      annotations: { readOnlyHint: false }
    }, async (params, extra) => await this.host.handleForm(this.sessionId, params.page_id, (engine) => engine.selectPath({
      pageId: params.page_id,
      signal: extra.signal,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      field: params.field,
      path: params.path,
      overwrite: params.overwrite,
      scope: params.scope
    }), extra.signal));
    this.server.registerTool("form_set_date", {
      description: "Set and verify an ISO date/month using value, or a supported date range using range. For observed date_group fields, use the group reference: split year/month parts or both UD month endpoints are handled in one call. A current checkbox is supported only for an explicitly observed compatible group. Separate endpoint fields use end_field and an explicit current_field for current=true. UI verification does not prove saving.",
      inputSchema: {
        ...operationFields,
        field: external_exports.string().min(1).max(240),
        value: external_exports.string().min(4).max(80).optional(),
        range: external_exports.object({ start: external_exports.string().min(4).max(10), end: external_exports.string().min(4).max(10).optional(), current: external_exports.boolean().optional() }).optional(),
        end_field: external_exports.string().min(1).max(240).optional(),
        current_field: external_exports.string().min(1).max(240).optional(),
        scope: external_exports.string().max(240).optional(),
        overwrite: external_exports.boolean().optional()
      },
      annotations: { readOnlyHint: false }
    }, async (params, extra) => await this.host.handleForm(this.sessionId, params.page_id, (engine) => engine.setDate({
      pageId: params.page_id,
      signal: extra.signal,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      field: params.field,
      value: params.value ?? "",
      range: params.range,
      endField: params.end_field,
      currentField: params.current_field,
      scope: params.scope,
      overwrite: params.overwrite
    }), extra.signal));
    this.server.registerTool("form_activate", {
      description: "Focus, open, close, add, save, or enter an ordinary next step by semantic target. Final submission and manual boundaries are blocked.",
      inputSchema: {
        ...operationFields,
        target: external_exports.string().min(1).max(240),
        scope: external_exports.string().max(240).optional(),
        intent: external_exports.enum(["focus", "open", "close", "add_record", "save_record", "next_step"])
      },
      annotations: { readOnlyHint: false }
    }, async (params, extra) => await this.host.handleForm(this.sessionId, params.page_id, (engine) => engine.activate({
      pageId: params.page_id,
      signal: extra.signal,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      target: params.target,
      scope: params.scope,
      intent: params.intent
    }), extra.signal));
  }
};
function browserErrorResult(error2) {
  if (error2 instanceof UnsupportedFormError) {
    const data2 = { ok: false, error: { code: error2.code }, support: error2.support, side_effects: "none" };
    return { isError: true, content: [{ type: "text", text: JSON.stringify(data2) }], structuredContent: data2 };
  }
  const message = error2 instanceof Error ? error2.message : String(error2);
  const typedCode = error2 && typeof error2 === "object" && "code" in error2 ? String(error2.code) : message;
  const safeCode = /^(prepared_[a-z_]+|profile_changed|profile_not_found|invalid_arguments|no_executable_plan)$/.test(typedCode) ? typedCode : void 0;
  const code = safeCode ?? (/^browser_lease_revoked:/.test(message) ? "browser_lease_revoked" : /^page_context_unavailable:/.test(message) ? "page_context_unavailable" : "browser_error");
  const data = { ok: false, error: { code, message: redactDiagnostic(message) } };
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    isError: true
  };
}
function redactDiagnostic(value) {
  return value.replaceAll(profileDir, `<chrome-profile:${profileHash(profileDir)}>`).replace(/\b(authorization|cookie|set-cookie)\s*[:=]\s*[^\s,;]+/gi, "$1=<redacted>").replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/g, "$1?<redacted>").slice(0, 1e3);
}

// node_modules/zod/v4/core/core.js
var NEVER2 = Object.freeze({
  status: "aborted"
});
// @__NO_SIDE_EFFECTS__
function $constructor(name, initializer3, params) {
  function init(inst, def) {
    var _a;
    Object.defineProperty(inst, "_zod", {
      value: inst._zod ?? {},
      enumerable: false
    });
    (_a = inst._zod).traits ?? (_a.traits = /* @__PURE__ */ new Set());
    inst._zod.traits.add(name);
    initializer3(inst, def);
    for (const k in _.prototype) {
      if (!(k in inst))
        Object.defineProperty(inst, k, { value: _.prototype[k].bind(inst) });
    }
    inst._zod.constr = _;
    inst._zod.def = def;
  }
  const Parent = params?.Parent ?? Object;
  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name });
  function _(def) {
    var _a;
    const inst = params?.Parent ? new Definition() : this;
    init(inst, def);
    (_a = inst._zod).deferred ?? (_a.deferred = []);
    for (const fn of inst._zod.deferred) {
      fn();
    }
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name);
    }
  });
  Object.defineProperty(_, "name", { value: name });
  return _;
}
var $ZodAsyncError = class extends Error {
  constructor() {
    super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
  }
};
var globalConfig = {};
function config(newConfig) {
  if (newConfig)
    Object.assign(globalConfig, newConfig);
  return globalConfig;
}

// node_modules/zod/v4/core/util.js
var util_exports = {};
__export(util_exports, {
  BIGINT_FORMAT_RANGES: () => BIGINT_FORMAT_RANGES,
  Class: () => Class,
  NUMBER_FORMAT_RANGES: () => NUMBER_FORMAT_RANGES,
  aborted: () => aborted,
  allowsEval: () => allowsEval,
  assert: () => assert,
  assertEqual: () => assertEqual,
  assertIs: () => assertIs,
  assertNever: () => assertNever,
  assertNotEqual: () => assertNotEqual,
  assignProp: () => assignProp,
  cached: () => cached,
  captureStackTrace: () => captureStackTrace,
  cleanEnum: () => cleanEnum,
  cleanRegex: () => cleanRegex,
  clone: () => clone,
  createTransparentProxy: () => createTransparentProxy,
  defineLazy: () => defineLazy,
  esc: () => esc,
  escapeRegex: () => escapeRegex,
  extend: () => extend,
  finalizeIssue: () => finalizeIssue,
  floatSafeRemainder: () => floatSafeRemainder2,
  getElementAtPath: () => getElementAtPath,
  getEnumValues: () => getEnumValues,
  getLengthableOrigin: () => getLengthableOrigin,
  getParsedType: () => getParsedType2,
  getSizableOrigin: () => getSizableOrigin,
  isObject: () => isObject,
  isPlainObject: () => isPlainObject,
  issue: () => issue,
  joinValues: () => joinValues,
  jsonStringifyReplacer: () => jsonStringifyReplacer,
  merge: () => merge,
  normalizeParams: () => normalizeParams,
  nullish: () => nullish,
  numKeys: () => numKeys,
  omit: () => omit,
  optionalKeys: () => optionalKeys,
  partial: () => partial,
  pick: () => pick,
  prefixIssues: () => prefixIssues,
  primitiveTypes: () => primitiveTypes,
  promiseAllObject: () => promiseAllObject,
  propertyKeyTypes: () => propertyKeyTypes,
  randomString: () => randomString,
  required: () => required,
  stringifyPrimitive: () => stringifyPrimitive,
  unwrapMessage: () => unwrapMessage
});
function assertEqual(val) {
  return val;
}
function assertNotEqual(val) {
  return val;
}
function assertIs(_arg) {
}
function assertNever(_x) {
  throw new Error();
}
function assert(_) {
}
function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter((v) => typeof v === "number");
  const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
  return values;
}
function joinValues(array3, separator = "|") {
  return array3.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}
function cached(getter) {
  const set = false;
  return {
    get value() {
      if (!set) {
        const value = getter();
        Object.defineProperty(this, "value", { value });
        return value;
      }
      throw new Error("cached value already set");
    }
  };
}
function nullish(input) {
  return input === null || input === void 0;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function floatSafeRemainder2(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
function defineLazy(object2, key2, getter) {
  const set = false;
  Object.defineProperty(object2, key2, {
    get() {
      if (!set) {
        const value = getter();
        object2[key2] = value;
        return value;
      }
      throw new Error("cached value already set");
    },
    set(v) {
      Object.defineProperty(object2, key2, {
        value: v
        // configurable: true,
      });
    },
    configurable: true
  });
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
function getElementAtPath(obj, path) {
  if (!path)
    return obj;
  return path.reduce((acc, key2) => acc?.[key2], obj);
}
function promiseAllObject(promisesObj) {
  const keys = Object.keys(promisesObj);
  const promises = keys.map((key2) => promisesObj[key2]);
  return Promise.all(promises).then((results) => {
    const resolvedObj = {};
    for (let i = 0; i < keys.length; i++) {
      resolvedObj[keys[i]] = results[i];
    }
    return resolvedObj;
  });
}
function randomString(length = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let str = "";
  for (let i = 0; i < length; i++) {
    str += chars[Math.floor(Math.random() * chars.length)];
  }
  return str;
}
function esc(str) {
  return JSON.stringify(str);
}
var captureStackTrace = Error.captureStackTrace ? Error.captureStackTrace : (..._args) => {
};
function isObject(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
var allowsEval = cached(() => {
  if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
    return false;
  }
  try {
    const F = Function;
    new F("");
    return true;
  } catch (_) {
    return false;
  }
});
function isPlainObject(o) {
  if (isObject(o) === false)
    return false;
  const ctor = o.constructor;
  if (ctor === void 0)
    return true;
  const prot = ctor.prototype;
  if (isObject(prot) === false)
    return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
function numKeys(data) {
  let keyCount = 0;
  for (const key2 in data) {
    if (Object.prototype.hasOwnProperty.call(data, key2)) {
      keyCount++;
    }
  }
  return keyCount;
}
var getParsedType2 = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return "undefined";
    case "string":
      return "string";
    case "number":
      return Number.isNaN(data) ? "nan" : "number";
    case "boolean":
      return "boolean";
    case "function":
      return "function";
    case "bigint":
      return "bigint";
    case "symbol":
      return "symbol";
    case "object":
      if (Array.isArray(data)) {
        return "array";
      }
      if (data === null) {
        return "null";
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return "promise";
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return "map";
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return "set";
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return "date";
      }
      if (typeof File !== "undefined" && data instanceof File) {
        return "file";
      }
      return "object";
    default:
      throw new Error(`Unknown data type: ${t}`);
  }
};
var propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
var primitiveTypes = /* @__PURE__ */ new Set(["string", "number", "bigint", "boolean", "symbol", "undefined"]);
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== void 0) {
    if (params?.error !== void 0)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function createTransparentProxy(getter) {
  let target;
  return new Proxy({}, {
    get(_, prop, receiver) {
      target ?? (target = getter());
      return Reflect.get(target, prop, receiver);
    },
    set(_, prop, value, receiver) {
      target ?? (target = getter());
      return Reflect.set(target, prop, value, receiver);
    },
    has(_, prop) {
      target ?? (target = getter());
      return Reflect.has(target, prop);
    },
    deleteProperty(_, prop) {
      target ?? (target = getter());
      return Reflect.deleteProperty(target, prop);
    },
    ownKeys(_) {
      target ?? (target = getter());
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(_, prop) {
      target ?? (target = getter());
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    defineProperty(_, prop, descriptor) {
      target ?? (target = getter());
      return Reflect.defineProperty(target, prop, descriptor);
    }
  });
}
function stringifyPrimitive(value) {
  if (typeof value === "bigint")
    return value.toString() + "n";
  if (typeof value === "string")
    return `"${value}"`;
  return `${value}`;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
  });
}
var NUMBER_FORMAT_RANGES = {
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-34028234663852886e22, 34028234663852886e22],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
};
var BIGINT_FORMAT_RANGES = {
  int64: [/* @__PURE__ */ BigInt("-9223372036854775808"), /* @__PURE__ */ BigInt("9223372036854775807")],
  uint64: [/* @__PURE__ */ BigInt(0), /* @__PURE__ */ BigInt("18446744073709551615")]
};
function pick(schema, mask) {
  const newShape = {};
  const currDef = schema._zod.def;
  for (const key2 in mask) {
    if (!(key2 in currDef.shape)) {
      throw new Error(`Unrecognized key: "${key2}"`);
    }
    if (!mask[key2])
      continue;
    newShape[key2] = currDef.shape[key2];
  }
  return clone(schema, {
    ...schema._zod.def,
    shape: newShape,
    checks: []
  });
}
function omit(schema, mask) {
  const newShape = { ...schema._zod.def.shape };
  const currDef = schema._zod.def;
  for (const key2 in mask) {
    if (!(key2 in currDef.shape)) {
      throw new Error(`Unrecognized key: "${key2}"`);
    }
    if (!mask[key2])
      continue;
    delete newShape[key2];
  }
  return clone(schema, {
    ...schema._zod.def,
    shape: newShape,
    checks: []
  });
}
function extend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to extend: expected a plain object");
  }
  const def = {
    ...schema._zod.def,
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
    checks: []
    // delete existing checks
  };
  return clone(schema, def);
}
function merge(a, b) {
  return clone(a, {
    ...a._zod.def,
    get shape() {
      const _shape = { ...a._zod.def.shape, ...b._zod.def.shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
    catchall: b._zod.def.catchall,
    checks: []
    // delete existing checks
  });
}
function partial(Class2, schema, mask) {
  const oldShape = schema._zod.def.shape;
  const shape = { ...oldShape };
  if (mask) {
    for (const key2 in mask) {
      if (!(key2 in oldShape)) {
        throw new Error(`Unrecognized key: "${key2}"`);
      }
      if (!mask[key2])
        continue;
      shape[key2] = Class2 ? new Class2({
        type: "optional",
        innerType: oldShape[key2]
      }) : oldShape[key2];
    }
  } else {
    for (const key2 in oldShape) {
      shape[key2] = Class2 ? new Class2({
        type: "optional",
        innerType: oldShape[key2]
      }) : oldShape[key2];
    }
  }
  return clone(schema, {
    ...schema._zod.def,
    shape,
    checks: []
  });
}
function required(Class2, schema, mask) {
  const oldShape = schema._zod.def.shape;
  const shape = { ...oldShape };
  if (mask) {
    for (const key2 in mask) {
      if (!(key2 in shape)) {
        throw new Error(`Unrecognized key: "${key2}"`);
      }
      if (!mask[key2])
        continue;
      shape[key2] = new Class2({
        type: "nonoptional",
        innerType: oldShape[key2]
      });
    }
  } else {
    for (const key2 in oldShape) {
      shape[key2] = new Class2({
        type: "nonoptional",
        innerType: oldShape[key2]
      });
    }
  }
  return clone(schema, {
    ...schema._zod.def,
    shape,
    // optional: [],
    checks: []
  });
}
function aborted(x, startIndex = 0) {
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true)
      return true;
  }
  return false;
}
function prefixIssues(path, issues) {
  return issues.map((iss) => {
    var _a;
    (_a = iss).path ?? (_a.path = []);
    iss.path.unshift(path);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config2) {
  const full = { ...iss, path: iss.path ?? [] };
  if (!iss.message) {
    const message = unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config2.customError?.(iss)) ?? unwrapMessage(config2.localeError?.(iss)) ?? "Invalid input";
    full.message = message;
  }
  delete full.inst;
  delete full.continue;
  if (!ctx?.reportInput) {
    delete full.input;
  }
  return full;
}
function getSizableOrigin(input) {
  if (input instanceof Set)
    return "set";
  if (input instanceof Map)
    return "map";
  if (input instanceof File)
    return "file";
  return "unknown";
}
function getLengthableOrigin(input) {
  if (Array.isArray(input))
    return "array";
  if (typeof input === "string")
    return "string";
  return "unknown";
}
function issue(...args) {
  const [iss, input, inst] = args;
  if (typeof iss === "string") {
    return {
      message: iss,
      code: "custom",
      input,
      inst
    };
  }
  return { ...iss };
}
function cleanEnum(obj) {
  return Object.entries(obj).filter(([k, _]) => {
    return Number.isNaN(Number.parseInt(k, 10));
  }).map((el) => el[1]);
}
var Class = class {
  constructor(..._args) {
  }
};

// node_modules/zod/v4/core/errors.js
var initializer = (inst, def) => {
  inst.name = "$ZodError";
  Object.defineProperty(inst, "_zod", {
    value: inst._zod,
    enumerable: false
  });
  Object.defineProperty(inst, "issues", {
    value: def,
    enumerable: false
  });
  Object.defineProperty(inst, "message", {
    get() {
      return JSON.stringify(def, jsonStringifyReplacer, 2);
    },
    enumerable: true
    // configurable: false,
  });
  Object.defineProperty(inst, "toString", {
    value: () => inst.message,
    enumerable: false
  });
};
var $ZodError = $constructor("$ZodError", initializer);
var $ZodRealError = $constructor("$ZodError", initializer, { Parent: Error });
function flattenError(error2, mapper = (issue2) => issue2.message) {
  const fieldErrors = {};
  const formErrors = [];
  for (const sub of error2.issues) {
    if (sub.path.length > 0) {
      fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
      fieldErrors[sub.path[0]].push(mapper(sub));
    } else {
      formErrors.push(mapper(sub));
    }
  }
  return { formErrors, fieldErrors };
}
function formatError(error2, _mapper) {
  const mapper = _mapper || function(issue2) {
    return issue2.message;
  };
  const fieldErrors = { _errors: [] };
  const processError = (error3) => {
    for (const issue2 of error3.issues) {
      if (issue2.code === "invalid_union" && issue2.errors.length) {
        issue2.errors.map((issues) => processError({ issues }));
      } else if (issue2.code === "invalid_key") {
        processError({ issues: issue2.issues });
      } else if (issue2.code === "invalid_element") {
        processError({ issues: issue2.issues });
      } else if (issue2.path.length === 0) {
        fieldErrors._errors.push(mapper(issue2));
      } else {
        let curr = fieldErrors;
        let i = 0;
        while (i < issue2.path.length) {
          const el = issue2.path[i];
          const terminal = i === issue2.path.length - 1;
          if (!terminal) {
            curr[el] = curr[el] || { _errors: [] };
          } else {
            curr[el] = curr[el] || { _errors: [] };
            curr[el]._errors.push(mapper(issue2));
          }
          curr = curr[el];
          i++;
        }
      }
    }
  };
  processError(error2);
  return fieldErrors;
}

// node_modules/zod/v4/core/parse.js
var _parse = (_Err) => (schema, value, _ctx, _params) => {
  const ctx = _ctx ? Object.assign(_ctx, { async: false }) : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError();
  }
  if (result.issues.length) {
    const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
    captureStackTrace(e, _params?.callee);
    throw e;
  }
  return result.value;
};
var _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
  const ctx = _ctx ? Object.assign(_ctx, { async: true }) : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  if (result.issues.length) {
    const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
    captureStackTrace(e, params?.callee);
    throw e;
  }
  return result.value;
};
var _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError();
  }
  return result.issues.length ? {
    success: false,
    error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
var safeParse = /* @__PURE__ */ _safeParse($ZodRealError);
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? Object.assign(_ctx, { async: true }) : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length ? {
    success: false,
    error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
var safeParseAsync = /* @__PURE__ */ _safeParseAsync($ZodRealError);

// node_modules/zod/v4/core/regexes.js
var cuid = /^[cC][^\s-]{8,}$/;
var cuid2 = /^[0-9a-z]+$/;
var ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
var xid = /^[0-9a-vA-V]{20}$/;
var ksuid = /^[A-Za-z0-9]{27}$/;
var nanoid = /^[a-zA-Z0-9_-]{21}$/;
var duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
var guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
var uuid = (version2) => {
  if (!version2)
    return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000)$/;
  return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version2}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
var email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
var _emoji = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
function emoji() {
  return new RegExp(_emoji, "u");
}
var ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})$/;
var cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
var cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
var base64url = /^[A-Za-z0-9_-]*$/;
var hostname = /^([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+$/;
var e164 = /^\+(?:[0-9]){6,14}[0-9]$/;
var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
var date3 = /* @__PURE__ */ new RegExp(`^${dateSource}$`);
function timeSource(args) {
  const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
  const regex = typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
  return regex;
}
function time(args) {
  return new RegExp(`^${timeSource(args)}$`);
}
function datetime(args) {
  const time3 = timeSource({ precision: args.precision });
  const opts = ["Z"];
  if (args.local)
    opts.push("");
  if (args.offset)
    opts.push(`([+-]\\d{2}:\\d{2})`);
  const timeRegex2 = `${time3}(?:${opts.join("|")})`;
  return new RegExp(`^${dateSource}T(?:${timeRegex2})$`);
}
var string = (params) => {
  const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
  return new RegExp(`^${regex}$`);
};
var integer = /^\d+$/;
var number = /^-?\d+(?:\.\d+)?/i;
var boolean = /true|false/i;
var _null = /null/i;
var lowercase = /^[^A-Z]*$/;
var uppercase = /^[^a-z]*$/;

// node_modules/zod/v4/core/checks.js
var $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
  var _a;
  inst._zod ?? (inst._zod = {});
  inst._zod.def = def;
  (_a = inst._zod).onattach ?? (_a.onattach = []);
});
var numericOriginMap = {
  number: "number",
  bigint: "bigint",
  object: "date"
};
var $ZodCheckLessThan = /* @__PURE__ */ $constructor("$ZodCheckLessThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
    if (def.value < curr) {
      if (def.inclusive)
        bag.maximum = def.value;
      else
        bag.exclusiveMaximum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
      return;
    }
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
    if (def.value > curr) {
      if (def.inclusive)
        bag.minimum = def.value;
      else
        bag.exclusiveMinimum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
      return;
    }
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMultipleOf = /* @__PURE__ */ $constructor("$ZodCheckMultipleOf", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    var _a;
    (_a = inst2._zod.bag).multipleOf ?? (_a.multipleOf = def.value);
  });
  inst._zod.check = (payload) => {
    if (typeof payload.value !== typeof def.value)
      throw new Error("Cannot mix number and bigint in multiple_of check.");
    const isMultiple = typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : floatSafeRemainder2(payload.value, def.value) === 0;
    if (isMultiple)
      return;
    payload.issues.push({
      origin: typeof payload.value,
      code: "not_multiple_of",
      divisor: def.value,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  def.format = def.format || "float64";
  const isInt = def.format?.includes("int");
  const origin = isInt ? "int" : "number";
  const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = def.format;
    bag.minimum = minimum;
    bag.maximum = maximum;
    if (isInt)
      bag.pattern = integer;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    if (isInt) {
      if (!Number.isInteger(input)) {
        payload.issues.push({
          expected: origin,
          format: def.format,
          code: "invalid_type",
          input,
          inst
        });
        return;
      }
      if (!Number.isSafeInteger(input)) {
        if (input > 0) {
          payload.issues.push({
            input,
            code: "too_big",
            maximum: Number.MAX_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            continue: !def.abort
          });
        } else {
          payload.issues.push({
            input,
            code: "too_small",
            minimum: Number.MIN_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            continue: !def.abort
          });
        }
        return;
      }
    }
    if (input < minimum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input > maximum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_big",
        maximum,
        inst
      });
    }
  };
});
var $ZodCheckMaxLength = /* @__PURE__ */ $constructor("$ZodCheckMaxLength", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== void 0;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
    if (def.maximum < curr)
      inst2._zod.bag.maximum = def.maximum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length <= def.maximum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: def.maximum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMinLength = /* @__PURE__ */ $constructor("$ZodCheckMinLength", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== void 0;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
    if (def.minimum > curr)
      inst2._zod.bag.minimum = def.minimum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length >= def.minimum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: def.minimum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLengthEquals = /* @__PURE__ */ $constructor("$ZodCheckLengthEquals", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== void 0;
  });
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.minimum = def.length;
    bag.maximum = def.length;
    bag.length = def.length;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length === def.length)
      return;
    const origin = getLengthableOrigin(input);
    const tooBig = length > def.length;
    payload.issues.push({
      origin,
      ...tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length },
      inclusive: true,
      exact: true,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStringFormat = /* @__PURE__ */ $constructor("$ZodCheckStringFormat", (inst, def) => {
  var _a, _b;
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = def.format;
    if (def.pattern) {
      bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
      bag.patterns.add(def.pattern);
    }
  });
  if (def.pattern)
    (_a = inst._zod).check ?? (_a.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: def.format,
        input: payload.value,
        ...def.pattern ? { pattern: def.pattern.toString() } : {},
        inst,
        continue: !def.abort
      });
    });
  else
    (_b = inst._zod).check ?? (_b.check = () => {
    });
});
var $ZodCheckRegex = /* @__PURE__ */ $constructor("$ZodCheckRegex", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    def.pattern.lastIndex = 0;
    if (def.pattern.test(payload.value))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "regex",
      input: payload.value,
      pattern: def.pattern.toString(),
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLowerCase = /* @__PURE__ */ $constructor("$ZodCheckLowerCase", (inst, def) => {
  def.pattern ?? (def.pattern = lowercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckUpperCase = /* @__PURE__ */ $constructor("$ZodCheckUpperCase", (inst, def) => {
  def.pattern ?? (def.pattern = uppercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckIncludes = /* @__PURE__ */ $constructor("$ZodCheckIncludes", (inst, def) => {
  $ZodCheck.init(inst, def);
  const escapedRegex = escapeRegex(def.includes);
  const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
  def.pattern = pattern;
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.includes(def.includes, def.position))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "includes",
      includes: def.includes,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStartsWith = /* @__PURE__ */ $constructor("$ZodCheckStartsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.startsWith(def.prefix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "starts_with",
      prefix: def.prefix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckEndsWith = /* @__PURE__ */ $constructor("$ZodCheckEndsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.endsWith(def.suffix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "ends_with",
      suffix: def.suffix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckOverwrite = /* @__PURE__ */ $constructor("$ZodCheckOverwrite", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    payload.value = def.tx(payload.value);
  };
});

// node_modules/zod/v4/core/doc.js
var Doc = class {
  constructor(args = []) {
    this.content = [];
    this.indent = 0;
    if (this)
      this.args = args;
  }
  indented(fn) {
    this.indent += 1;
    fn(this);
    this.indent -= 1;
  }
  write(arg) {
    if (typeof arg === "function") {
      arg(this, { execution: "sync" });
      arg(this, { execution: "async" });
      return;
    }
    const content = arg;
    const lines = content.split("\n").filter((x) => x);
    const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
    const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
    for (const line of dedented) {
      this.content.push(line);
    }
  }
  compile() {
    const F = Function;
    const args = this?.args;
    const content = this?.content ?? [``];
    const lines = [...content.map((x) => `  ${x}`)];
    return new F(...args, lines.join("\n"));
  }
};

// node_modules/zod/v4/core/versions.js
var version = {
  major: 4,
  minor: 0,
  patch: 0
};

// node_modules/zod/v4/core/schemas.js
var $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version;
  const checks = [...inst._zod.def.checks ?? []];
  if (inst._zod.traits.has("$ZodCheck")) {
    checks.unshift(inst);
  }
  for (const ch of checks) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks.length === 0) {
    (_a = inst._zod).deferred ?? (_a.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks2, ctx) => {
      let isAborted2 = aborted(payload);
      let asyncResult;
      for (const ch of checks2) {
        if (ch._zod.def.when) {
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun)
            continue;
        } else if (isAborted2) {
          continue;
        }
        const currLen = payload.issues.length;
        const _ = ch._zod.check(payload);
        if (_ instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError();
        }
        if (asyncResult || _ instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _;
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              return;
            if (!isAborted2)
              isAborted2 = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen)
            continue;
          if (!isAborted2)
            isAborted2 = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    inst._zod.run = (payload, ctx) => {
      const result = inst._zod.parse(payload, ctx);
      if (result instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError();
        return result.then((result2) => runChecks(result2, checks, ctx));
      }
      return runChecks(result, checks, ctx);
    };
  }
  inst["~standard"] = {
    validate: (value) => {
      try {
        const r = safeParse(inst, value);
        return r.success ? { value: r.data } : { issues: r.error?.issues };
      } catch (_) {
        return safeParseAsync(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
      }
    },
    vendor: "zod",
    version: 1
  };
});
var $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string(inst._zod.bag);
  inst._zod.parse = (payload, _) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_2) {
      }
    if (typeof payload.value === "string")
      return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodStringFormat = /* @__PURE__ */ $constructor("$ZodStringFormat", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  $ZodString.init(inst, def);
});
var $ZodGUID = /* @__PURE__ */ $constructor("$ZodGUID", (inst, def) => {
  def.pattern ?? (def.pattern = guid);
  $ZodStringFormat.init(inst, def);
});
var $ZodUUID = /* @__PURE__ */ $constructor("$ZodUUID", (inst, def) => {
  if (def.version) {
    const versionMap = {
      v1: 1,
      v2: 2,
      v3: 3,
      v4: 4,
      v5: 5,
      v6: 6,
      v7: 7,
      v8: 8
    };
    const v = versionMap[def.version];
    if (v === void 0)
      throw new Error(`Invalid UUID version: "${def.version}"`);
    def.pattern ?? (def.pattern = uuid(v));
  } else
    def.pattern ?? (def.pattern = uuid());
  $ZodStringFormat.init(inst, def);
});
var $ZodEmail = /* @__PURE__ */ $constructor("$ZodEmail", (inst, def) => {
  def.pattern ?? (def.pattern = email);
  $ZodStringFormat.init(inst, def);
});
var $ZodURL = /* @__PURE__ */ $constructor("$ZodURL", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    try {
      const orig = payload.value;
      const url = new URL(orig);
      const href = url.href;
      if (def.hostname) {
        def.hostname.lastIndex = 0;
        if (!def.hostname.test(url.hostname)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid hostname",
            pattern: hostname.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (def.protocol) {
        def.protocol.lastIndex = 0;
        if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid protocol",
            pattern: def.protocol.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (!orig.endsWith("/") && href.endsWith("/")) {
        payload.value = href.slice(0, -1);
      } else {
        payload.value = href;
      }
      return;
    } catch (_) {
      payload.issues.push({
        code: "invalid_format",
        format: "url",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodEmoji = /* @__PURE__ */ $constructor("$ZodEmoji", (inst, def) => {
  def.pattern ?? (def.pattern = emoji());
  $ZodStringFormat.init(inst, def);
});
var $ZodNanoID = /* @__PURE__ */ $constructor("$ZodNanoID", (inst, def) => {
  def.pattern ?? (def.pattern = nanoid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID = /* @__PURE__ */ $constructor("$ZodCUID", (inst, def) => {
  def.pattern ?? (def.pattern = cuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID2 = /* @__PURE__ */ $constructor("$ZodCUID2", (inst, def) => {
  def.pattern ?? (def.pattern = cuid2);
  $ZodStringFormat.init(inst, def);
});
var $ZodULID = /* @__PURE__ */ $constructor("$ZodULID", (inst, def) => {
  def.pattern ?? (def.pattern = ulid);
  $ZodStringFormat.init(inst, def);
});
var $ZodXID = /* @__PURE__ */ $constructor("$ZodXID", (inst, def) => {
  def.pattern ?? (def.pattern = xid);
  $ZodStringFormat.init(inst, def);
});
var $ZodKSUID = /* @__PURE__ */ $constructor("$ZodKSUID", (inst, def) => {
  def.pattern ?? (def.pattern = ksuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodISODateTime = /* @__PURE__ */ $constructor("$ZodISODateTime", (inst, def) => {
  def.pattern ?? (def.pattern = datetime(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODate = /* @__PURE__ */ $constructor("$ZodISODate", (inst, def) => {
  def.pattern ?? (def.pattern = date3);
  $ZodStringFormat.init(inst, def);
});
var $ZodISOTime = /* @__PURE__ */ $constructor("$ZodISOTime", (inst, def) => {
  def.pattern ?? (def.pattern = time(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODuration = /* @__PURE__ */ $constructor("$ZodISODuration", (inst, def) => {
  def.pattern ?? (def.pattern = duration);
  $ZodStringFormat.init(inst, def);
});
var $ZodIPv4 = /* @__PURE__ */ $constructor("$ZodIPv4", (inst, def) => {
  def.pattern ?? (def.pattern = ipv4);
  $ZodStringFormat.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = `ipv4`;
  });
});
var $ZodIPv6 = /* @__PURE__ */ $constructor("$ZodIPv6", (inst, def) => {
  def.pattern ?? (def.pattern = ipv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = `ipv6`;
  });
  inst._zod.check = (payload) => {
    try {
      new URL(`http://[${payload.value}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "ipv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCIDRv4 = /* @__PURE__ */ $constructor("$ZodCIDRv4", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv4);
  $ZodStringFormat.init(inst, def);
});
var $ZodCIDRv6 = /* @__PURE__ */ $constructor("$ZodCIDRv6", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    const [address, prefix] = payload.value.split("/");
    try {
      if (!prefix)
        throw new Error();
      const prefixNum = Number(prefix);
      if (`${prefixNum}` !== prefix)
        throw new Error();
      if (prefixNum < 0 || prefixNum > 128)
        throw new Error();
      new URL(`http://[${address}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "cidrv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
function isValidBase64(data) {
  if (data === "")
    return true;
  if (data.length % 4 !== 0)
    return false;
  try {
    atob(data);
    return true;
  } catch {
    return false;
  }
}
var $ZodBase64 = /* @__PURE__ */ $constructor("$ZodBase64", (inst, def) => {
  def.pattern ?? (def.pattern = base64);
  $ZodStringFormat.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    inst2._zod.bag.contentEncoding = "base64";
  });
  inst._zod.check = (payload) => {
    if (isValidBase64(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
function isValidBase64URL(data) {
  if (!base64url.test(data))
    return false;
  const base642 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
  const padded = base642.padEnd(Math.ceil(base642.length / 4) * 4, "=");
  return isValidBase64(padded);
}
var $ZodBase64URL = /* @__PURE__ */ $constructor("$ZodBase64URL", (inst, def) => {
  def.pattern ?? (def.pattern = base64url);
  $ZodStringFormat.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    inst2._zod.bag.contentEncoding = "base64url";
  });
  inst._zod.check = (payload) => {
    if (isValidBase64URL(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64url",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodE164 = /* @__PURE__ */ $constructor("$ZodE164", (inst, def) => {
  def.pattern ?? (def.pattern = e164);
  $ZodStringFormat.init(inst, def);
});
function isValidJWT2(token, algorithm = null) {
  try {
    const tokensParts = token.split(".");
    if (tokensParts.length !== 3)
      return false;
    const [header] = tokensParts;
    if (!header)
      return false;
    const parsedHeader = JSON.parse(atob(header));
    if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
      return false;
    if (!parsedHeader.alg)
      return false;
    if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
      return false;
    return true;
  } catch {
    return false;
  }
}
var $ZodJWT = /* @__PURE__ */ $constructor("$ZodJWT", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (isValidJWT2(payload.value, def.alg))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "jwt",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = inst._zod.bag.pattern ?? number;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_) {
      }
    const input = payload.value;
    if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
      return payload;
    }
    const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : void 0 : void 0;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input,
      inst,
      ...received ? { received } : {}
    });
    return payload;
  };
});
var $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodCheckNumberFormat.init(inst, def);
  $ZodNumber.init(inst, def);
});
var $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = boolean;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Boolean(payload.value);
      } catch (_) {
      }
    const input = payload.value;
    if (typeof input === "boolean")
      return payload;
    payload.issues.push({
      expected: "boolean",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodNull = /* @__PURE__ */ $constructor("$ZodNull", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = _null;
  inst._zod.values = /* @__PURE__ */ new Set([null]);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (input === null)
      return payload;
    payload.issues.push({
      expected: "null",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
var $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    payload.issues.push({
      expected: "never",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
var $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        expected: "array",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = Array(input.length);
    const proms = [];
    for (let i = 0; i < input.length; i++) {
      const item = input[i];
      const result = def.element._zod.run({
        value: item,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result2) => handleArrayResult(result2, payload, i)));
      } else {
        handleArrayResult(result, payload, i);
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
function handleObjectResult(result, final, key2) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(key2, result.issues));
  }
  final.value[key2] = result.value;
}
function handleOptionalObjectResult(result, final, key2, input) {
  if (result.issues.length) {
    if (input[key2] === void 0) {
      if (key2 in input) {
        final.value[key2] = void 0;
      } else {
        final.value[key2] = result.value;
      }
    } else {
      final.issues.push(...prefixIssues(key2, result.issues));
    }
  } else if (result.value === void 0) {
    if (key2 in input)
      final.value[key2] = void 0;
  } else {
    final.value[key2] = result.value;
  }
}
var $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
  $ZodType.init(inst, def);
  const _normalized = cached(() => {
    const keys = Object.keys(def.shape);
    for (const k of keys) {
      if (!(def.shape[k] instanceof $ZodType)) {
        throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
      }
    }
    const okeys = optionalKeys(def.shape);
    return {
      shape: def.shape,
      keys,
      keySet: new Set(keys),
      numKeys: keys.length,
      optionalKeys: new Set(okeys)
    };
  });
  defineLazy(inst._zod, "propValues", () => {
    const shape = def.shape;
    const propValues = {};
    for (const key2 in shape) {
      const field = shape[key2]._zod;
      if (field.values) {
        propValues[key2] ?? (propValues[key2] = /* @__PURE__ */ new Set());
        for (const v of field.values)
          propValues[key2].add(v);
      }
    }
    return propValues;
  });
  const generateFastpass = (shape) => {
    const doc = new Doc(["shape", "payload", "ctx"]);
    const normalized2 = _normalized.value;
    const parseStr = (key2) => {
      const k = esc(key2);
      return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
    };
    doc.write(`const input = payload.value;`);
    const ids = /* @__PURE__ */ Object.create(null);
    let counter = 0;
    for (const key2 of normalized2.keys) {
      ids[key2] = `key_${counter++}`;
    }
    doc.write(`const newResult = {}`);
    for (const key2 of normalized2.keys) {
      if (normalized2.optionalKeys.has(key2)) {
        const id3 = ids[key2];
        doc.write(`const ${id3} = ${parseStr(key2)};`);
        const k = esc(key2);
        doc.write(`
        if (${id3}.issues.length) {
          if (input[${k}] === undefined) {
            if (${k} in input) {
              newResult[${k}] = undefined;
            }
          } else {
            payload.issues = payload.issues.concat(
              ${id3}.issues.map((iss) => ({
                ...iss,
                path: iss.path ? [${k}, ...iss.path] : [${k}],
              }))
            );
          }
        } else if (${id3}.value === undefined) {
          if (${k} in input) newResult[${k}] = undefined;
        } else {
          newResult[${k}] = ${id3}.value;
        }
        `);
      } else {
        const id3 = ids[key2];
        doc.write(`const ${id3} = ${parseStr(key2)};`);
        doc.write(`
          if (${id3}.issues.length) payload.issues = payload.issues.concat(${id3}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${esc(key2)}, ...iss.path] : [${esc(key2)}]
          })));`);
        doc.write(`newResult[${esc(key2)}] = ${id3}.value`);
      }
    }
    doc.write(`payload.value = newResult;`);
    doc.write(`return payload;`);
    const fn = doc.compile();
    return (payload, ctx) => fn(shape, payload, ctx);
  };
  let fastpass;
  const isObject2 = isObject;
  const jit = !globalConfig.jitless;
  const allowsEval2 = allowsEval;
  const fastEnabled = jit && allowsEval2.value;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
      if (!fastpass)
        fastpass = generateFastpass(def.shape);
      payload = fastpass(payload, ctx);
    } else {
      payload.value = {};
      const shape = value.shape;
      for (const key2 of value.keys) {
        const el = shape[key2];
        const r = el._zod.run({ value: input[key2], issues: [] }, ctx);
        const isOptional = el._zod.optin === "optional" && el._zod.optout === "optional";
        if (r instanceof Promise) {
          proms.push(r.then((r2) => isOptional ? handleOptionalObjectResult(r2, payload, key2, input) : handleObjectResult(r2, payload, key2)));
        } else if (isOptional) {
          handleOptionalObjectResult(r, payload, key2, input);
        } else {
          handleObjectResult(r, payload, key2);
        }
      }
    }
    if (!catchall) {
      return proms.length ? Promise.all(proms).then(() => payload) : payload;
    }
    const unrecognized = [];
    const keySet = value.keySet;
    const _catchall = catchall._zod;
    const t = _catchall.def.type;
    for (const key2 of Object.keys(input)) {
      if (keySet.has(key2))
        continue;
      if (t === "never") {
        unrecognized.push(key2);
        continue;
      }
      const r = _catchall.run({ value: input[key2], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((r2) => handleObjectResult(r2, payload, key2)));
      } else {
        handleObjectResult(r, payload, key2);
      }
    }
    if (unrecognized.length) {
      payload.issues.push({
        code: "unrecognized_keys",
        keys: unrecognized,
        input,
        inst
      });
    }
    if (!proms.length)
      return payload;
    return Promise.all(proms).then(() => {
      return payload;
    });
  };
});
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  });
  return final;
}
var $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : void 0);
  defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
  defineLazy(inst._zod, "values", () => {
    if (def.options.every((o) => o._zod.values)) {
      return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
    }
    return void 0;
  });
  defineLazy(inst._zod, "pattern", () => {
    if (def.options.every((o) => o._zod.pattern)) {
      const patterns = def.options.map((o) => o._zod.pattern);
      return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
    }
    return void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run({
        value: payload.value,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        if (result.issues.length === 0)
          return result;
        results.push(result);
      }
    }
    if (!async)
      return handleUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results2) => {
      return handleUnionResults(results2, payload, inst, ctx);
    });
  };
});
var $ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  const _super = inst._zod.parse;
  defineLazy(inst._zod, "propValues", () => {
    const propValues = {};
    for (const option of def.options) {
      const pv = option._zod.propValues;
      if (!pv || Object.keys(pv).length === 0)
        throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
      for (const [k, v] of Object.entries(pv)) {
        if (!propValues[k])
          propValues[k] = /* @__PURE__ */ new Set();
        for (const val of v) {
          propValues[k].add(val);
        }
      }
    }
    return propValues;
  });
  const disc = cached(() => {
    const opts = def.options;
    const map = /* @__PURE__ */ new Map();
    for (const o of opts) {
      const values = o._zod.propValues[def.discriminator];
      if (!values || values.size === 0)
        throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(o)}"`);
      for (const v of values) {
        if (map.has(v)) {
          throw new Error(`Duplicate discriminator value "${String(v)}"`);
        }
        map.set(v, o);
      }
    }
    return map;
  });
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isObject(input)) {
      payload.issues.push({
        code: "invalid_type",
        expected: "object",
        input,
        inst
      });
      return payload;
    }
    const opt = disc.value.get(input?.[def.discriminator]);
    if (opt) {
      return opt._zod.run(payload, ctx);
    }
    if (def.unionFallback) {
      return _super(payload, ctx);
    }
    payload.issues.push({
      code: "invalid_union",
      errors: [],
      note: "No matching discriminator",
      input,
      path: [def.discriminator],
      inst
    });
    return payload;
  };
});
var $ZodIntersection = /* @__PURE__ */ $constructor("$ZodIntersection", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    const left = def.left._zod.run({ value: input, issues: [] }, ctx);
    const right = def.right._zod.run({ value: input, issues: [] }, ctx);
    const async = left instanceof Promise || right instanceof Promise;
    if (async) {
      return Promise.all([left, right]).then(([left2, right2]) => {
        return handleIntersectionResults(payload, left2, right2);
      });
    }
    return handleIntersectionResults(payload, left, right);
  };
});
function mergeValues2(a, b) {
  if (a === b) {
    return { valid: true, data: a };
  }
  if (a instanceof Date && b instanceof Date && +a === +b) {
    return { valid: true, data: a };
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const bKeys = Object.keys(b);
    const sharedKeys = Object.keys(a).filter((key2) => bKeys.indexOf(key2) !== -1);
    const newObj = { ...a, ...b };
    for (const key2 of sharedKeys) {
      const sharedValue = mergeValues2(a[key2], b[key2]);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [key2, ...sharedValue.mergeErrorPath]
        };
      }
      newObj[key2] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return { valid: false, mergeErrorPath: [] };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues2(itemA, itemB);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
        };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  }
  return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
  if (left.issues.length) {
    result.issues.push(...left.issues);
  }
  if (right.issues.length) {
    result.issues.push(...right.issues);
  }
  if (aborted(result))
    return result;
  const merged = mergeValues2(left.value, right.value);
  if (!merged.valid) {
    throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
  }
  result.value = merged.data;
  return result;
}
var $ZodRecord = /* @__PURE__ */ $constructor("$ZodRecord", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isPlainObject(input)) {
      payload.issues.push({
        expected: "record",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    if (def.keyType._zod.values) {
      const values = def.keyType._zod.values;
      payload.value = {};
      for (const key2 of values) {
        if (typeof key2 === "string" || typeof key2 === "number" || typeof key2 === "symbol") {
          const result = def.valueType._zod.run({ value: input[key2], issues: [] }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result2) => {
              if (result2.issues.length) {
                payload.issues.push(...prefixIssues(key2, result2.issues));
              }
              payload.value[key2] = result2.value;
            }));
          } else {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key2, result.issues));
            }
            payload.value[key2] = result.value;
          }
        }
      }
      let unrecognized;
      for (const key2 in input) {
        if (!values.has(key2)) {
          unrecognized = unrecognized ?? [];
          unrecognized.push(key2);
        }
      }
      if (unrecognized && unrecognized.length > 0) {
        payload.issues.push({
          code: "unrecognized_keys",
          input,
          inst,
          keys: unrecognized
        });
      }
    } else {
      payload.value = {};
      for (const key2 of Reflect.ownKeys(input)) {
        if (key2 === "__proto__")
          continue;
        const keyResult = def.keyType._zod.run({ value: key2, issues: [] }, ctx);
        if (keyResult instanceof Promise) {
          throw new Error("Async schemas not supported in object keys currently");
        }
        if (keyResult.issues.length) {
          payload.issues.push({
            origin: "record",
            code: "invalid_key",
            issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
            input: key2,
            path: [key2],
            inst
          });
          payload.value[keyResult.value] = keyResult.value;
          continue;
        }
        const result = def.valueType._zod.run({ value: input[key2], issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result2) => {
            if (result2.issues.length) {
              payload.issues.push(...prefixIssues(key2, result2.issues));
            }
            payload.value[keyResult.value] = result2.value;
          }));
        } else {
          if (result.issues.length) {
            payload.issues.push(...prefixIssues(key2, result.issues));
          }
          payload.value[keyResult.value] = result.value;
        }
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
var $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
  $ZodType.init(inst, def);
  const values = getEnumValues(def.entries);
  inst._zod.values = new Set(values);
  inst._zod.pattern = new RegExp(`^(${values.filter((k) => propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? escapeRegex(o) : o.toString()).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (inst._zod.values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.values = new Set(def.values);
  inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? o.toString() : String(o)).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (inst._zod.values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values: def.values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodTransform = /* @__PURE__ */ $constructor("$ZodTransform", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    const _out = def.transform(payload.value, payload);
    if (_ctx.async) {
      const output = _out instanceof Promise ? _out : Promise.resolve(_out);
      return output.then((output2) => {
        payload.value = output2;
        return payload;
      });
    }
    if (_out instanceof Promise) {
      throw new $ZodAsyncError();
    }
    payload.value = _out;
    return payload;
  };
});
var $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  inst._zod.optout = "optional";
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, void 0]) : void 0;
  });
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (def.innerType._zod.optin === "optional") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === void 0) {
      return payload;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
  });
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, null]) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === null)
      return payload;
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodDefault = /* @__PURE__ */ $constructor("$ZodDefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === void 0) {
      payload.value = def.defaultValue;
      return payload;
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleDefaultResult(result2, def));
    }
    return handleDefaultResult(result, def);
  };
});
function handleDefaultResult(payload, def) {
  if (payload.value === void 0) {
    payload.value = def.defaultValue;
  }
  return payload;
}
var $ZodPrefault = /* @__PURE__ */ $constructor("$ZodPrefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === void 0) {
      payload.value = def.defaultValue;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNonOptional = /* @__PURE__ */ $constructor("$ZodNonOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => {
    const v = def.innerType._zod.values;
    return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleNonOptionalResult(result2, inst));
    }
    return handleNonOptionalResult(result, inst);
  };
});
function handleNonOptionalResult(payload, inst) {
  if (!payload.issues.length && payload.value === void 0) {
    payload.issues.push({
      code: "invalid_type",
      expected: "nonoptional",
      input: payload.value,
      inst
    });
  }
  return payload;
}
var $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => {
        payload.value = result2.value;
        if (result2.issues.length) {
          payload.value = def.catchValue({
            ...payload,
            error: {
              issues: result2.issues.map((iss) => finalizeIssue(iss, ctx, config()))
            },
            input: payload.value
          });
          payload.issues = [];
        }
        return payload;
      });
    }
    payload.value = result.value;
    if (result.issues.length) {
      payload.value = def.catchValue({
        ...payload,
        error: {
          issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
        },
        input: payload.value
      });
      payload.issues = [];
    }
    return payload;
  };
});
var $ZodPipe = /* @__PURE__ */ $constructor("$ZodPipe", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => def.in._zod.values);
  defineLazy(inst._zod, "optin", () => def.in._zod.optin);
  defineLazy(inst._zod, "optout", () => def.out._zod.optout);
  inst._zod.parse = (payload, ctx) => {
    const left = def.in._zod.run(payload, ctx);
    if (left instanceof Promise) {
      return left.then((left2) => handlePipeResult(left2, def, ctx));
    }
    return handlePipeResult(left, def, ctx);
  };
});
function handlePipeResult(left, def, ctx) {
  if (aborted(left)) {
    return left;
  }
  return def.out._zod.run({ value: left.value, issues: left.issues }, ctx);
}
var $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  inst._zod.parse = (payload, ctx) => {
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then(handleReadonlyResult);
    }
    return handleReadonlyResult(result);
  };
});
function handleReadonlyResult(payload) {
  payload.value = Object.freeze(payload.value);
  return payload;
}
var $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
  $ZodCheck.init(inst, def);
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _) => {
    return payload;
  };
  inst._zod.check = (payload) => {
    const input = payload.value;
    const r = def.fn(input);
    if (r instanceof Promise) {
      return r.then((r2) => handleRefineResult(r2, payload, input, inst));
    }
    handleRefineResult(r, payload, input, inst);
    return;
  };
});
function handleRefineResult(result, payload, input, inst) {
  if (!result) {
    const _iss = {
      code: "custom",
      input,
      inst,
      // incorporates params.error into issue reporting
      path: [...inst._zod.def.path ?? []],
      // incorporates params.error into issue reporting
      continue: !inst._zod.def.abort
      // params: inst._zod.def.params,
    };
    if (inst._zod.def.params)
      _iss.params = inst._zod.def.params;
    payload.issues.push(issue(_iss));
  }
}

// node_modules/zod/v4/locales/en.js
var parsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "NaN" : "number";
    }
    case "object": {
      if (Array.isArray(data)) {
        return "array";
      }
      if (data === null) {
        return "null";
      }
      if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
        return data.constructor.name;
      }
    }
  }
  return t;
};
var error = () => {
  const Sizable = {
    string: { unit: "characters", verb: "to have" },
    file: { unit: "bytes", verb: "to have" },
    array: { unit: "items", verb: "to have" },
    set: { unit: "items", verb: "to have" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const Nouns = {
    regex: "input",
    email: "email address",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datetime",
    date: "ISO date",
    time: "ISO time",
    duration: "ISO duration",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded string",
    base64url: "base64url-encoded string",
    json_string: "JSON string",
    e164: "E.164 number",
    jwt: "JWT",
    template_literal: "input"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Invalid input: expected ${issue2.expected}, received ${parsedType(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Invalid input: expected ${stringifyPrimitive(issue2.values[0])}`;
        return `Invalid option: expected one of ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Too big: expected ${issue2.origin ?? "value"} to have ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elements"}`;
        return `Too big: expected ${issue2.origin ?? "value"} to be ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Too small: expected ${issue2.origin} to have ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Too small: expected ${issue2.origin} to be ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Invalid string: must start with "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Invalid string: must end with "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Invalid string: must include "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Invalid string: must match pattern ${_issue.pattern}`;
        return `Invalid ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Invalid number: must be a multiple of ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Unrecognized key${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Invalid key in ${issue2.origin}`;
      case "invalid_union":
        return "Invalid input";
      case "invalid_element":
        return `Invalid value in ${issue2.origin}`;
      default:
        return `Invalid input`;
    }
  };
};
function en_default2() {
  return {
    localeError: error()
  };
}

// node_modules/zod/v4/core/registries.js
var $ZodRegistry = class {
  constructor() {
    this._map = /* @__PURE__ */ new Map();
    this._idmap = /* @__PURE__ */ new Map();
  }
  add(schema, ..._meta) {
    const meta = _meta[0];
    this._map.set(schema, meta);
    if (meta && typeof meta === "object" && "id" in meta) {
      if (this._idmap.has(meta.id)) {
        throw new Error(`ID ${meta.id} already exists in the registry`);
      }
      this._idmap.set(meta.id, schema);
    }
    return this;
  }
  clear() {
    this._map = /* @__PURE__ */ new Map();
    this._idmap = /* @__PURE__ */ new Map();
    return this;
  }
  remove(schema) {
    const meta = this._map.get(schema);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.delete(meta.id);
    }
    this._map.delete(schema);
    return this;
  }
  get(schema) {
    const p = schema._zod.parent;
    if (p) {
      const pm = { ...this.get(p) ?? {} };
      delete pm.id;
      return { ...pm, ...this._map.get(schema) };
    }
    return this._map.get(schema);
  }
  has(schema) {
    return this._map.has(schema);
  }
};
function registry() {
  return new $ZodRegistry();
}
var globalRegistry = /* @__PURE__ */ registry();

// node_modules/zod/v4/core/api.js
function _string(Class2, params) {
  return new Class2({
    type: "string",
    ...normalizeParams(params)
  });
}
function _email(Class2, params) {
  return new Class2({
    type: "string",
    format: "email",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _guid(Class2, params) {
  return new Class2({
    type: "string",
    format: "guid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuidv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v4",
    ...normalizeParams(params)
  });
}
function _uuidv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v6",
    ...normalizeParams(params)
  });
}
function _uuidv7(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v7",
    ...normalizeParams(params)
  });
}
function _url(Class2, params) {
  return new Class2({
    type: "string",
    format: "url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _emoji2(Class2, params) {
  return new Class2({
    type: "string",
    format: "emoji",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _nanoid(Class2, params) {
  return new Class2({
    type: "string",
    format: "nanoid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid2(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid2",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ulid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ulid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _xid(Class2, params) {
  return new Class2({
    type: "string",
    format: "xid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ksuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ksuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64url(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _e164(Class2, params) {
  return new Class2({
    type: "string",
    format: "e164",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _jwt(Class2, params) {
  return new Class2({
    type: "string",
    format: "jwt",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _isoDateTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "datetime",
    check: "string_format",
    offset: false,
    local: false,
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDate(Class2, params) {
  return new Class2({
    type: "string",
    format: "date",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _isoTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "time",
    check: "string_format",
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDuration(Class2, params) {
  return new Class2({
    type: "string",
    format: "duration",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _number(Class2, params) {
  return new Class2({
    type: "number",
    checks: [],
    ...normalizeParams(params)
  });
}
function _int(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params)
  });
}
function _boolean(Class2, params) {
  return new Class2({
    type: "boolean",
    ...normalizeParams(params)
  });
}
function _null2(Class2, params) {
  return new Class2({
    type: "null",
    ...normalizeParams(params)
  });
}
function _unknown(Class2) {
  return new Class2({
    type: "unknown"
  });
}
function _never(Class2, params) {
  return new Class2({
    type: "never",
    ...normalizeParams(params)
  });
}
function _lt(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _lte(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _gt(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _multipleOf(value, params) {
  return new $ZodCheckMultipleOf({
    check: "multiple_of",
    ...normalizeParams(params),
    value
  });
}
function _maxLength(maximum, params) {
  const ch = new $ZodCheckMaxLength({
    check: "max_length",
    ...normalizeParams(params),
    maximum
  });
  return ch;
}
function _minLength(minimum, params) {
  return new $ZodCheckMinLength({
    check: "min_length",
    ...normalizeParams(params),
    minimum
  });
}
function _length(length, params) {
  return new $ZodCheckLengthEquals({
    check: "length_equals",
    ...normalizeParams(params),
    length
  });
}
function _regex(pattern, params) {
  return new $ZodCheckRegex({
    check: "string_format",
    format: "regex",
    ...normalizeParams(params),
    pattern
  });
}
function _lowercase(params) {
  return new $ZodCheckLowerCase({
    check: "string_format",
    format: "lowercase",
    ...normalizeParams(params)
  });
}
function _uppercase(params) {
  return new $ZodCheckUpperCase({
    check: "string_format",
    format: "uppercase",
    ...normalizeParams(params)
  });
}
function _includes(includes, params) {
  return new $ZodCheckIncludes({
    check: "string_format",
    format: "includes",
    ...normalizeParams(params),
    includes
  });
}
function _startsWith(prefix, params) {
  return new $ZodCheckStartsWith({
    check: "string_format",
    format: "starts_with",
    ...normalizeParams(params),
    prefix
  });
}
function _endsWith(suffix, params) {
  return new $ZodCheckEndsWith({
    check: "string_format",
    format: "ends_with",
    ...normalizeParams(params),
    suffix
  });
}
function _overwrite(tx) {
  return new $ZodCheckOverwrite({
    check: "overwrite",
    tx
  });
}
function _normalize(form) {
  return _overwrite((input) => input.normalize(form));
}
function _trim() {
  return _overwrite((input) => input.trim());
}
function _toLowerCase() {
  return _overwrite((input) => input.toLowerCase());
}
function _toUpperCase() {
  return _overwrite((input) => input.toUpperCase());
}
function _array(Class2, element, params) {
  return new Class2({
    type: "array",
    element,
    // get element() {
    //   return element;
    // },
    ...normalizeParams(params)
  });
}
function _custom(Class2, fn, _params) {
  const norm = normalizeParams(_params);
  norm.abort ?? (norm.abort = true);
  const schema = new Class2({
    type: "custom",
    check: "custom",
    fn,
    ...norm
  });
  return schema;
}
function _refine(Class2, fn, _params) {
  const schema = new Class2({
    type: "custom",
    check: "custom",
    fn,
    ...normalizeParams(_params)
  });
  return schema;
}

// node_modules/zod/v4/classic/iso.js
var iso_exports = {};
__export(iso_exports, {
  ZodISODate: () => ZodISODate,
  ZodISODateTime: () => ZodISODateTime,
  ZodISODuration: () => ZodISODuration,
  ZodISOTime: () => ZodISOTime,
  date: () => date4,
  datetime: () => datetime2,
  duration: () => duration2,
  time: () => time2
});
var ZodISODateTime = /* @__PURE__ */ $constructor("ZodISODateTime", (inst, def) => {
  $ZodISODateTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function datetime2(params) {
  return _isoDateTime(ZodISODateTime, params);
}
var ZodISODate = /* @__PURE__ */ $constructor("ZodISODate", (inst, def) => {
  $ZodISODate.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function date4(params) {
  return _isoDate(ZodISODate, params);
}
var ZodISOTime = /* @__PURE__ */ $constructor("ZodISOTime", (inst, def) => {
  $ZodISOTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function time2(params) {
  return _isoTime(ZodISOTime, params);
}
var ZodISODuration = /* @__PURE__ */ $constructor("ZodISODuration", (inst, def) => {
  $ZodISODuration.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function duration2(params) {
  return _isoDuration(ZodISODuration, params);
}

// node_modules/zod/v4/classic/errors.js
var initializer2 = (inst, issues) => {
  $ZodError.init(inst, issues);
  inst.name = "ZodError";
  Object.defineProperties(inst, {
    format: {
      value: (mapper) => formatError(inst, mapper)
      // enumerable: false,
    },
    flatten: {
      value: (mapper) => flattenError(inst, mapper)
      // enumerable: false,
    },
    addIssue: {
      value: (issue2) => inst.issues.push(issue2)
      // enumerable: false,
    },
    addIssues: {
      value: (issues2) => inst.issues.push(...issues2)
      // enumerable: false,
    },
    isEmpty: {
      get() {
        return inst.issues.length === 0;
      }
      // enumerable: false,
    }
  });
};
var ZodError2 = $constructor("ZodError", initializer2);
var ZodRealError = $constructor("ZodError", initializer2, {
  Parent: Error
});

// node_modules/zod/v4/classic/parse.js
var parse = /* @__PURE__ */ _parse(ZodRealError);
var parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
var safeParse2 = /* @__PURE__ */ _safeParse(ZodRealError);
var safeParseAsync2 = /* @__PURE__ */ _safeParseAsync(ZodRealError);

// node_modules/zod/v4/classic/schemas.js
var ZodType2 = /* @__PURE__ */ $constructor("ZodType", (inst, def) => {
  $ZodType.init(inst, def);
  inst.def = def;
  Object.defineProperty(inst, "_def", { value: def });
  inst.check = (...checks) => {
    return inst.clone(
      {
        ...def,
        checks: [
          ...def.checks ?? [],
          ...checks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
        ]
      }
      // { parent: true }
    );
  };
  inst.clone = (def2, params) => clone(inst, def2, params);
  inst.brand = () => inst;
  inst.register = ((reg, meta) => {
    reg.add(inst, meta);
    return inst;
  });
  inst.parse = (data, params) => parse(inst, data, params, { callee: inst.parse });
  inst.safeParse = (data, params) => safeParse2(inst, data, params);
  inst.parseAsync = async (data, params) => parseAsync(inst, data, params, { callee: inst.parseAsync });
  inst.safeParseAsync = async (data, params) => safeParseAsync2(inst, data, params);
  inst.spa = inst.safeParseAsync;
  inst.refine = (check2, params) => inst.check(refine(check2, params));
  inst.superRefine = (refinement) => inst.check(superRefine(refinement));
  inst.overwrite = (fn) => inst.check(_overwrite(fn));
  inst.optional = () => optional2(inst);
  inst.nullable = () => nullable(inst);
  inst.nullish = () => optional2(nullable(inst));
  inst.nonoptional = (params) => nonoptional(inst, params);
  inst.array = () => array2(inst);
  inst.or = (arg) => union([inst, arg]);
  inst.and = (arg) => intersection(inst, arg);
  inst.transform = (tx) => pipe(inst, transform(tx));
  inst.default = (def2) => _default(inst, def2);
  inst.prefault = (def2) => prefault(inst, def2);
  inst.catch = (params) => _catch(inst, params);
  inst.pipe = (target) => pipe(inst, target);
  inst.readonly = () => readonly(inst);
  inst.describe = (description) => {
    const cl = inst.clone();
    globalRegistry.add(cl, { description });
    return cl;
  };
  Object.defineProperty(inst, "description", {
    get() {
      return globalRegistry.get(inst)?.description;
    },
    configurable: true
  });
  inst.meta = (...args) => {
    if (args.length === 0) {
      return globalRegistry.get(inst);
    }
    const cl = inst.clone();
    globalRegistry.add(cl, args[0]);
    return cl;
  };
  inst.isOptional = () => inst.safeParse(void 0).success;
  inst.isNullable = () => inst.safeParse(null).success;
  return inst;
});
var _ZodString = /* @__PURE__ */ $constructor("_ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  ZodType2.init(inst, def);
  const bag = inst._zod.bag;
  inst.format = bag.format ?? null;
  inst.minLength = bag.minimum ?? null;
  inst.maxLength = bag.maximum ?? null;
  inst.regex = (...args) => inst.check(_regex(...args));
  inst.includes = (...args) => inst.check(_includes(...args));
  inst.startsWith = (...args) => inst.check(_startsWith(...args));
  inst.endsWith = (...args) => inst.check(_endsWith(...args));
  inst.min = (...args) => inst.check(_minLength(...args));
  inst.max = (...args) => inst.check(_maxLength(...args));
  inst.length = (...args) => inst.check(_length(...args));
  inst.nonempty = (...args) => inst.check(_minLength(1, ...args));
  inst.lowercase = (params) => inst.check(_lowercase(params));
  inst.uppercase = (params) => inst.check(_uppercase(params));
  inst.trim = () => inst.check(_trim());
  inst.normalize = (...args) => inst.check(_normalize(...args));
  inst.toLowerCase = () => inst.check(_toLowerCase());
  inst.toUpperCase = () => inst.check(_toUpperCase());
});
var ZodString2 = /* @__PURE__ */ $constructor("ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  _ZodString.init(inst, def);
  inst.email = (params) => inst.check(_email(ZodEmail, params));
  inst.url = (params) => inst.check(_url(ZodURL, params));
  inst.jwt = (params) => inst.check(_jwt(ZodJWT, params));
  inst.emoji = (params) => inst.check(_emoji2(ZodEmoji, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.uuid = (params) => inst.check(_uuid(ZodUUID, params));
  inst.uuidv4 = (params) => inst.check(_uuidv4(ZodUUID, params));
  inst.uuidv6 = (params) => inst.check(_uuidv6(ZodUUID, params));
  inst.uuidv7 = (params) => inst.check(_uuidv7(ZodUUID, params));
  inst.nanoid = (params) => inst.check(_nanoid(ZodNanoID, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.cuid = (params) => inst.check(_cuid(ZodCUID, params));
  inst.cuid2 = (params) => inst.check(_cuid2(ZodCUID2, params));
  inst.ulid = (params) => inst.check(_ulid(ZodULID, params));
  inst.base64 = (params) => inst.check(_base64(ZodBase64, params));
  inst.base64url = (params) => inst.check(_base64url(ZodBase64URL, params));
  inst.xid = (params) => inst.check(_xid(ZodXID, params));
  inst.ksuid = (params) => inst.check(_ksuid(ZodKSUID, params));
  inst.ipv4 = (params) => inst.check(_ipv4(ZodIPv4, params));
  inst.ipv6 = (params) => inst.check(_ipv6(ZodIPv6, params));
  inst.cidrv4 = (params) => inst.check(_cidrv4(ZodCIDRv4, params));
  inst.cidrv6 = (params) => inst.check(_cidrv6(ZodCIDRv6, params));
  inst.e164 = (params) => inst.check(_e164(ZodE164, params));
  inst.datetime = (params) => inst.check(datetime2(params));
  inst.date = (params) => inst.check(date4(params));
  inst.time = (params) => inst.check(time2(params));
  inst.duration = (params) => inst.check(duration2(params));
});
function string2(params) {
  return _string(ZodString2, params);
}
var ZodStringFormat = /* @__PURE__ */ $constructor("ZodStringFormat", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  _ZodString.init(inst, def);
});
var ZodEmail = /* @__PURE__ */ $constructor("ZodEmail", (inst, def) => {
  $ZodEmail.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodGUID = /* @__PURE__ */ $constructor("ZodGUID", (inst, def) => {
  $ZodGUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodUUID = /* @__PURE__ */ $constructor("ZodUUID", (inst, def) => {
  $ZodUUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodURL = /* @__PURE__ */ $constructor("ZodURL", (inst, def) => {
  $ZodURL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodEmoji = /* @__PURE__ */ $constructor("ZodEmoji", (inst, def) => {
  $ZodEmoji.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodNanoID = /* @__PURE__ */ $constructor("ZodNanoID", (inst, def) => {
  $ZodNanoID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCUID = /* @__PURE__ */ $constructor("ZodCUID", (inst, def) => {
  $ZodCUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCUID2 = /* @__PURE__ */ $constructor("ZodCUID2", (inst, def) => {
  $ZodCUID2.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodULID = /* @__PURE__ */ $constructor("ZodULID", (inst, def) => {
  $ZodULID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodXID = /* @__PURE__ */ $constructor("ZodXID", (inst, def) => {
  $ZodXID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodKSUID = /* @__PURE__ */ $constructor("ZodKSUID", (inst, def) => {
  $ZodKSUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodIPv4 = /* @__PURE__ */ $constructor("ZodIPv4", (inst, def) => {
  $ZodIPv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodIPv6 = /* @__PURE__ */ $constructor("ZodIPv6", (inst, def) => {
  $ZodIPv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCIDRv4 = /* @__PURE__ */ $constructor("ZodCIDRv4", (inst, def) => {
  $ZodCIDRv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCIDRv6 = /* @__PURE__ */ $constructor("ZodCIDRv6", (inst, def) => {
  $ZodCIDRv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodBase64 = /* @__PURE__ */ $constructor("ZodBase64", (inst, def) => {
  $ZodBase64.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodBase64URL = /* @__PURE__ */ $constructor("ZodBase64URL", (inst, def) => {
  $ZodBase64URL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodE164 = /* @__PURE__ */ $constructor("ZodE164", (inst, def) => {
  $ZodE164.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodJWT = /* @__PURE__ */ $constructor("ZodJWT", (inst, def) => {
  $ZodJWT.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodNumber2 = /* @__PURE__ */ $constructor("ZodNumber", (inst, def) => {
  $ZodNumber.init(inst, def);
  ZodType2.init(inst, def);
  inst.gt = (value, params) => inst.check(_gt(value, params));
  inst.gte = (value, params) => inst.check(_gte(value, params));
  inst.min = (value, params) => inst.check(_gte(value, params));
  inst.lt = (value, params) => inst.check(_lt(value, params));
  inst.lte = (value, params) => inst.check(_lte(value, params));
  inst.max = (value, params) => inst.check(_lte(value, params));
  inst.int = (params) => inst.check(int(params));
  inst.safe = (params) => inst.check(int(params));
  inst.positive = (params) => inst.check(_gt(0, params));
  inst.nonnegative = (params) => inst.check(_gte(0, params));
  inst.negative = (params) => inst.check(_lt(0, params));
  inst.nonpositive = (params) => inst.check(_lte(0, params));
  inst.multipleOf = (value, params) => inst.check(_multipleOf(value, params));
  inst.step = (value, params) => inst.check(_multipleOf(value, params));
  inst.finite = () => inst;
  const bag = inst._zod.bag;
  inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
  inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
  inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? 0.5);
  inst.isFinite = true;
  inst.format = bag.format ?? null;
});
function number2(params) {
  return _number(ZodNumber2, params);
}
var ZodNumberFormat = /* @__PURE__ */ $constructor("ZodNumberFormat", (inst, def) => {
  $ZodNumberFormat.init(inst, def);
  ZodNumber2.init(inst, def);
});
function int(params) {
  return _int(ZodNumberFormat, params);
}
var ZodBoolean2 = /* @__PURE__ */ $constructor("ZodBoolean", (inst, def) => {
  $ZodBoolean.init(inst, def);
  ZodType2.init(inst, def);
});
function boolean2(params) {
  return _boolean(ZodBoolean2, params);
}
var ZodNull2 = /* @__PURE__ */ $constructor("ZodNull", (inst, def) => {
  $ZodNull.init(inst, def);
  ZodType2.init(inst, def);
});
function _null3(params) {
  return _null2(ZodNull2, params);
}
var ZodUnknown2 = /* @__PURE__ */ $constructor("ZodUnknown", (inst, def) => {
  $ZodUnknown.init(inst, def);
  ZodType2.init(inst, def);
});
function unknown() {
  return _unknown(ZodUnknown2);
}
var ZodNever2 = /* @__PURE__ */ $constructor("ZodNever", (inst, def) => {
  $ZodNever.init(inst, def);
  ZodType2.init(inst, def);
});
function never(params) {
  return _never(ZodNever2, params);
}
var ZodArray2 = /* @__PURE__ */ $constructor("ZodArray", (inst, def) => {
  $ZodArray.init(inst, def);
  ZodType2.init(inst, def);
  inst.element = def.element;
  inst.min = (minLength, params) => inst.check(_minLength(minLength, params));
  inst.nonempty = (params) => inst.check(_minLength(1, params));
  inst.max = (maxLength, params) => inst.check(_maxLength(maxLength, params));
  inst.length = (len, params) => inst.check(_length(len, params));
  inst.unwrap = () => inst.element;
});
function array2(element, params) {
  return _array(ZodArray2, element, params);
}
var ZodObject2 = /* @__PURE__ */ $constructor("ZodObject", (inst, def) => {
  $ZodObject.init(inst, def);
  ZodType2.init(inst, def);
  util_exports.defineLazy(inst, "shape", () => def.shape);
  inst.keyof = () => _enum(Object.keys(inst._zod.def.shape));
  inst.catchall = (catchall) => inst.clone({ ...inst._zod.def, catchall });
  inst.passthrough = () => inst.clone({ ...inst._zod.def, catchall: unknown() });
  inst.loose = () => inst.clone({ ...inst._zod.def, catchall: unknown() });
  inst.strict = () => inst.clone({ ...inst._zod.def, catchall: never() });
  inst.strip = () => inst.clone({ ...inst._zod.def, catchall: void 0 });
  inst.extend = (incoming) => {
    return util_exports.extend(inst, incoming);
  };
  inst.merge = (other) => util_exports.merge(inst, other);
  inst.pick = (mask) => util_exports.pick(inst, mask);
  inst.omit = (mask) => util_exports.omit(inst, mask);
  inst.partial = (...args) => util_exports.partial(ZodOptional2, inst, args[0]);
  inst.required = (...args) => util_exports.required(ZodNonOptional, inst, args[0]);
});
function object(shape, params) {
  const def = {
    type: "object",
    get shape() {
      util_exports.assignProp(this, "shape", { ...shape });
      return this.shape;
    },
    ...util_exports.normalizeParams(params)
  };
  return new ZodObject2(def);
}
function looseObject(shape, params) {
  return new ZodObject2({
    type: "object",
    get shape() {
      util_exports.assignProp(this, "shape", { ...shape });
      return this.shape;
    },
    catchall: unknown(),
    ...util_exports.normalizeParams(params)
  });
}
var ZodUnion2 = /* @__PURE__ */ $constructor("ZodUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  ZodType2.init(inst, def);
  inst.options = def.options;
});
function union(options, params) {
  return new ZodUnion2({
    type: "union",
    options,
    ...util_exports.normalizeParams(params)
  });
}
var ZodDiscriminatedUnion2 = /* @__PURE__ */ $constructor("ZodDiscriminatedUnion", (inst, def) => {
  ZodUnion2.init(inst, def);
  $ZodDiscriminatedUnion.init(inst, def);
});
function discriminatedUnion(discriminator, options, params) {
  return new ZodDiscriminatedUnion2({
    type: "union",
    options,
    discriminator,
    ...util_exports.normalizeParams(params)
  });
}
var ZodIntersection2 = /* @__PURE__ */ $constructor("ZodIntersection", (inst, def) => {
  $ZodIntersection.init(inst, def);
  ZodType2.init(inst, def);
});
function intersection(left, right) {
  return new ZodIntersection2({
    type: "intersection",
    left,
    right
  });
}
var ZodRecord2 = /* @__PURE__ */ $constructor("ZodRecord", (inst, def) => {
  $ZodRecord.init(inst, def);
  ZodType2.init(inst, def);
  inst.keyType = def.keyType;
  inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
  return new ZodRecord2({
    type: "record",
    keyType,
    valueType,
    ...util_exports.normalizeParams(params)
  });
}
var ZodEnum2 = /* @__PURE__ */ $constructor("ZodEnum", (inst, def) => {
  $ZodEnum.init(inst, def);
  ZodType2.init(inst, def);
  inst.enum = def.entries;
  inst.options = Object.values(def.entries);
  const keys = new Set(Object.keys(def.entries));
  inst.extract = (values, params) => {
    const newEntries = {};
    for (const value of values) {
      if (keys.has(value)) {
        newEntries[value] = def.entries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum2({
      ...def,
      checks: [],
      ...util_exports.normalizeParams(params),
      entries: newEntries
    });
  };
  inst.exclude = (values, params) => {
    const newEntries = { ...def.entries };
    for (const value of values) {
      if (keys.has(value)) {
        delete newEntries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum2({
      ...def,
      checks: [],
      ...util_exports.normalizeParams(params),
      entries: newEntries
    });
  };
});
function _enum(values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new ZodEnum2({
    type: "enum",
    entries,
    ...util_exports.normalizeParams(params)
  });
}
var ZodLiteral2 = /* @__PURE__ */ $constructor("ZodLiteral", (inst, def) => {
  $ZodLiteral.init(inst, def);
  ZodType2.init(inst, def);
  inst.values = new Set(def.values);
  Object.defineProperty(inst, "value", {
    get() {
      if (def.values.length > 1) {
        throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
      }
      return def.values[0];
    }
  });
});
function literal(value, params) {
  return new ZodLiteral2({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...util_exports.normalizeParams(params)
  });
}
var ZodTransform = /* @__PURE__ */ $constructor("ZodTransform", (inst, def) => {
  $ZodTransform.init(inst, def);
  ZodType2.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(util_exports.issue(issue2, payload.value, def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = inst);
        _issue.continue ?? (_issue.continue = true);
        payload.issues.push(util_exports.issue(_issue));
      }
    };
    const output = def.transform(payload.value, payload);
    if (output instanceof Promise) {
      return output.then((output2) => {
        payload.value = output2;
        return payload;
      });
    }
    payload.value = output;
    return payload;
  };
});
function transform(fn) {
  return new ZodTransform({
    type: "transform",
    transform: fn
  });
}
var ZodOptional2 = /* @__PURE__ */ $constructor("ZodOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  ZodType2.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
});
function optional2(innerType) {
  return new ZodOptional2({
    type: "optional",
    innerType
  });
}
var ZodNullable2 = /* @__PURE__ */ $constructor("ZodNullable", (inst, def) => {
  $ZodNullable.init(inst, def);
  ZodType2.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
  return new ZodNullable2({
    type: "nullable",
    innerType
  });
}
var ZodDefault2 = /* @__PURE__ */ $constructor("ZodDefault", (inst, def) => {
  $ZodDefault.init(inst, def);
  ZodType2.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeDefault = inst.unwrap;
});
function _default(innerType, defaultValue) {
  return new ZodDefault2({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : defaultValue;
    }
  });
}
var ZodPrefault = /* @__PURE__ */ $constructor("ZodPrefault", (inst, def) => {
  $ZodPrefault.init(inst, def);
  ZodType2.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
  return new ZodPrefault({
    type: "prefault",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : defaultValue;
    }
  });
}
var ZodNonOptional = /* @__PURE__ */ $constructor("ZodNonOptional", (inst, def) => {
  $ZodNonOptional.init(inst, def);
  ZodType2.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
  return new ZodNonOptional({
    type: "nonoptional",
    innerType,
    ...util_exports.normalizeParams(params)
  });
}
var ZodCatch2 = /* @__PURE__ */ $constructor("ZodCatch", (inst, def) => {
  $ZodCatch.init(inst, def);
  ZodType2.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeCatch = inst.unwrap;
});
function _catch(innerType, catchValue) {
  return new ZodCatch2({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
  });
}
var ZodPipe = /* @__PURE__ */ $constructor("ZodPipe", (inst, def) => {
  $ZodPipe.init(inst, def);
  ZodType2.init(inst, def);
  inst.in = def.in;
  inst.out = def.out;
});
function pipe(in_, out) {
  return new ZodPipe({
    type: "pipe",
    in: in_,
    out
    // ...util.normalizeParams(params),
  });
}
var ZodReadonly2 = /* @__PURE__ */ $constructor("ZodReadonly", (inst, def) => {
  $ZodReadonly.init(inst, def);
  ZodType2.init(inst, def);
});
function readonly(innerType) {
  return new ZodReadonly2({
    type: "readonly",
    innerType
  });
}
var ZodCustom = /* @__PURE__ */ $constructor("ZodCustom", (inst, def) => {
  $ZodCustom.init(inst, def);
  ZodType2.init(inst, def);
});
function check(fn) {
  const ch = new $ZodCheck({
    check: "custom"
    // ...util.normalizeParams(params),
  });
  ch._zod.check = fn;
  return ch;
}
function custom2(fn, _params) {
  return _custom(ZodCustom, fn ?? (() => true), _params);
}
function refine(fn, _params = {}) {
  return _refine(ZodCustom, fn, _params);
}
function superRefine(fn) {
  const ch = check((payload) => {
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(util_exports.issue(issue2, payload.value, ch._zod.def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = ch);
        _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
        payload.issues.push(util_exports.issue(_issue));
      }
    };
    return fn(payload.value, payload);
  });
  return ch;
}
function preprocess(fn, schema) {
  return pipe(transform(fn), schema);
}

// node_modules/zod/v4/classic/external.js
config(en_default2());

// node_modules/@modelcontextprotocol/sdk/dist/esm/types.js
var RELATED_TASK_META_KEY = "io.modelcontextprotocol/related-task";
var JSONRPC_VERSION = "2.0";
var AssertObjectSchema = custom2((v) => v !== null && (typeof v === "object" || typeof v === "function"));
var ProgressTokenSchema = union([string2(), number2().int()]);
var CursorSchema = string2();
var TaskCreationParamsSchema = looseObject({
  /**
   * Requested duration in milliseconds to retain task from creation.
   */
  ttl: number2().optional(),
  /**
   * Time in milliseconds to wait between task status requests.
   */
  pollInterval: number2().optional()
});
var TaskMetadataSchema = object({
  ttl: number2().optional()
});
var RelatedTaskMetadataSchema = object({
  taskId: string2()
});
var RequestMetaSchema = looseObject({
  /**
   * If specified, the caller is requesting out-of-band progress notifications for this request (as represented by notifications/progress). The value of this parameter is an opaque token that will be attached to any subsequent notifications. The receiver is not obligated to provide these notifications.
   */
  progressToken: ProgressTokenSchema.optional(),
  /**
   * If specified, this request is related to the provided task.
   */
  [RELATED_TASK_META_KEY]: RelatedTaskMetadataSchema.optional()
});
var BaseRequestParamsSchema = object({
  /**
   * See [General fields: `_meta`](/specification/draft/basic/index#meta) for notes on `_meta` usage.
   */
  _meta: RequestMetaSchema.optional()
});
var TaskAugmentedRequestParamsSchema = BaseRequestParamsSchema.extend({
  /**
   * If specified, the caller is requesting task-augmented execution for this request.
   * The request will return a CreateTaskResult immediately, and the actual result can be
   * retrieved later via tasks/result.
   *
   * Task augmentation is subject to capability negotiation - receivers MUST declare support
   * for task augmentation of specific request types in their capabilities.
   */
  task: TaskMetadataSchema.optional()
});
var RequestSchema = object({
  method: string2(),
  params: BaseRequestParamsSchema.loose().optional()
});
var NotificationsParamsSchema = object({
  /**
   * See [MCP specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/47339c03c143bb4ec01a26e721a1b8fe66634ebe/docs/specification/draft/basic/index.mdx#general-fields)
   * for notes on _meta usage.
   */
  _meta: RequestMetaSchema.optional()
});
var NotificationSchema = object({
  method: string2(),
  params: NotificationsParamsSchema.loose().optional()
});
var ResultSchema = looseObject({
  /**
   * See [MCP specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/47339c03c143bb4ec01a26e721a1b8fe66634ebe/docs/specification/draft/basic/index.mdx#general-fields)
   * for notes on _meta usage.
   */
  _meta: RequestMetaSchema.optional()
});
var RequestIdSchema = union([string2(), number2().int()]);
var JSONRPCRequestSchema = object({
  jsonrpc: literal(JSONRPC_VERSION),
  id: RequestIdSchema,
  ...RequestSchema.shape
}).strict();
var JSONRPCNotificationSchema = object({
  jsonrpc: literal(JSONRPC_VERSION),
  ...NotificationSchema.shape
}).strict();
var JSONRPCResultResponseSchema = object({
  jsonrpc: literal(JSONRPC_VERSION),
  id: RequestIdSchema,
  result: ResultSchema
}).strict();
var ErrorCode;
(function(ErrorCode2) {
  ErrorCode2[ErrorCode2["ConnectionClosed"] = -32e3] = "ConnectionClosed";
  ErrorCode2[ErrorCode2["RequestTimeout"] = -32001] = "RequestTimeout";
  ErrorCode2[ErrorCode2["ParseError"] = -32700] = "ParseError";
  ErrorCode2[ErrorCode2["InvalidRequest"] = -32600] = "InvalidRequest";
  ErrorCode2[ErrorCode2["MethodNotFound"] = -32601] = "MethodNotFound";
  ErrorCode2[ErrorCode2["InvalidParams"] = -32602] = "InvalidParams";
  ErrorCode2[ErrorCode2["InternalError"] = -32603] = "InternalError";
  ErrorCode2[ErrorCode2["UrlElicitationRequired"] = -32042] = "UrlElicitationRequired";
})(ErrorCode || (ErrorCode = {}));
var JSONRPCErrorResponseSchema = object({
  jsonrpc: literal(JSONRPC_VERSION),
  id: RequestIdSchema.optional(),
  error: object({
    /**
     * The error type that occurred.
     */
    code: number2().int(),
    /**
     * A short description of the error. The message SHOULD be limited to a concise single sentence.
     */
    message: string2(),
    /**
     * Additional information about the error. The value of this member is defined by the sender (e.g. detailed error information, nested errors etc.).
     */
    data: unknown().optional()
  })
}).strict();
var JSONRPCMessageSchema = union([
  JSONRPCRequestSchema,
  JSONRPCNotificationSchema,
  JSONRPCResultResponseSchema,
  JSONRPCErrorResponseSchema
]);
var JSONRPCResponseSchema = union([JSONRPCResultResponseSchema, JSONRPCErrorResponseSchema]);
var EmptyResultSchema = ResultSchema.strict();
var CancelledNotificationParamsSchema = NotificationsParamsSchema.extend({
  /**
   * The ID of the request to cancel.
   *
   * This MUST correspond to the ID of a request previously issued in the same direction.
   */
  requestId: RequestIdSchema.optional(),
  /**
   * An optional string describing the reason for the cancellation. This MAY be logged or presented to the user.
   */
  reason: string2().optional()
});
var CancelledNotificationSchema = NotificationSchema.extend({
  method: literal("notifications/cancelled"),
  params: CancelledNotificationParamsSchema
});
var IconSchema = object({
  /**
   * URL or data URI for the icon.
   */
  src: string2(),
  /**
   * Optional MIME type for the icon.
   */
  mimeType: string2().optional(),
  /**
   * Optional array of strings that specify sizes at which the icon can be used.
   * Each string should be in WxH format (e.g., `"48x48"`, `"96x96"`) or `"any"` for scalable formats like SVG.
   *
   * If not provided, the client should assume that the icon can be used at any size.
   */
  sizes: array2(string2()).optional(),
  /**
   * Optional specifier for the theme this icon is designed for. `light` indicates
   * the icon is designed to be used with a light background, and `dark` indicates
   * the icon is designed to be used with a dark background.
   *
   * If not provided, the client should assume the icon can be used with any theme.
   */
  theme: _enum(["light", "dark"]).optional()
});
var IconsSchema = object({
  /**
   * Optional set of sized icons that the client can display in a user interface.
   *
   * Clients that support rendering icons MUST support at least the following MIME types:
   * - `image/png` - PNG images (safe, universal compatibility)
   * - `image/jpeg` (and `image/jpg`) - JPEG images (safe, universal compatibility)
   *
   * Clients that support rendering icons SHOULD also support:
   * - `image/svg+xml` - SVG images (scalable but requires security precautions)
   * - `image/webp` - WebP images (modern, efficient format)
   */
  icons: array2(IconSchema).optional()
});
var BaseMetadataSchema = object({
  /** Intended for programmatic or logical use, but used as a display name in past specs or fallback */
  name: string2(),
  /**
   * Intended for UI and end-user contexts — optimized to be human-readable and easily understood,
   * even by those unfamiliar with domain-specific terminology.
   *
   * If not provided, the name should be used for display (except for Tool,
   * where `annotations.title` should be given precedence over using `name`,
   * if present).
   */
  title: string2().optional()
});
var ImplementationSchema = BaseMetadataSchema.extend({
  ...BaseMetadataSchema.shape,
  ...IconsSchema.shape,
  version: string2(),
  /**
   * An optional URL of the website for this implementation.
   */
  websiteUrl: string2().optional(),
  /**
   * An optional human-readable description of what this implementation does.
   *
   * This can be used by clients or servers to provide context about their purpose
   * and capabilities. For example, a server might describe the types of resources
   * or tools it provides, while a client might describe its intended use case.
   */
  description: string2().optional()
});
var FormElicitationCapabilitySchema = intersection(object({
  applyDefaults: boolean2().optional()
}), record(string2(), unknown()));
var ElicitationCapabilitySchema = preprocess((value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (Object.keys(value).length === 0) {
      return { form: {} };
    }
  }
  return value;
}, intersection(object({
  form: FormElicitationCapabilitySchema.optional(),
  url: AssertObjectSchema.optional()
}), record(string2(), unknown()).optional()));
var ClientTasksCapabilitySchema = looseObject({
  /**
   * Present if the client supports listing tasks.
   */
  list: AssertObjectSchema.optional(),
  /**
   * Present if the client supports cancelling tasks.
   */
  cancel: AssertObjectSchema.optional(),
  /**
   * Capabilities for task creation on specific request types.
   */
  requests: looseObject({
    /**
     * Task support for sampling requests.
     */
    sampling: looseObject({
      createMessage: AssertObjectSchema.optional()
    }).optional(),
    /**
     * Task support for elicitation requests.
     */
    elicitation: looseObject({
      create: AssertObjectSchema.optional()
    }).optional()
  }).optional()
});
var ServerTasksCapabilitySchema = looseObject({
  /**
   * Present if the server supports listing tasks.
   */
  list: AssertObjectSchema.optional(),
  /**
   * Present if the server supports cancelling tasks.
   */
  cancel: AssertObjectSchema.optional(),
  /**
   * Capabilities for task creation on specific request types.
   */
  requests: looseObject({
    /**
     * Task support for tool requests.
     */
    tools: looseObject({
      call: AssertObjectSchema.optional()
    }).optional()
  }).optional()
});
var ClientCapabilitiesSchema = object({
  /**
   * Experimental, non-standard capabilities that the client supports.
   */
  experimental: record(string2(), AssertObjectSchema).optional(),
  /**
   * Present if the client supports sampling from an LLM.
   */
  sampling: object({
    /**
     * Present if the client supports context inclusion via includeContext parameter.
     * If not declared, servers SHOULD only use `includeContext: "none"` (or omit it).
     */
    context: AssertObjectSchema.optional(),
    /**
     * Present if the client supports tool use via tools and toolChoice parameters.
     */
    tools: AssertObjectSchema.optional()
  }).optional(),
  /**
   * Present if the client supports eliciting user input.
   */
  elicitation: ElicitationCapabilitySchema.optional(),
  /**
   * Present if the client supports listing roots.
   */
  roots: object({
    /**
     * Whether the client supports issuing notifications for changes to the roots list.
     */
    listChanged: boolean2().optional()
  }).optional(),
  /**
   * Present if the client supports task creation.
   */
  tasks: ClientTasksCapabilitySchema.optional(),
  /**
   * Extensions that the client supports. Keys are extension identifiers (vendor-prefix/extension-name).
   */
  extensions: record(string2(), AssertObjectSchema).optional()
});
var InitializeRequestParamsSchema = BaseRequestParamsSchema.extend({
  /**
   * The latest version of the Model Context Protocol that the client supports. The client MAY decide to support older versions as well.
   */
  protocolVersion: string2(),
  capabilities: ClientCapabilitiesSchema,
  clientInfo: ImplementationSchema
});
var InitializeRequestSchema = RequestSchema.extend({
  method: literal("initialize"),
  params: InitializeRequestParamsSchema
});
var ServerCapabilitiesSchema = object({
  /**
   * Experimental, non-standard capabilities that the server supports.
   */
  experimental: record(string2(), AssertObjectSchema).optional(),
  /**
   * Present if the server supports sending log messages to the client.
   */
  logging: AssertObjectSchema.optional(),
  /**
   * Present if the server supports sending completions to the client.
   */
  completions: AssertObjectSchema.optional(),
  /**
   * Present if the server offers any prompt templates.
   */
  prompts: object({
    /**
     * Whether this server supports issuing notifications for changes to the prompt list.
     */
    listChanged: boolean2().optional()
  }).optional(),
  /**
   * Present if the server offers any resources to read.
   */
  resources: object({
    /**
     * Whether this server supports clients subscribing to resource updates.
     */
    subscribe: boolean2().optional(),
    /**
     * Whether this server supports issuing notifications for changes to the resource list.
     */
    listChanged: boolean2().optional()
  }).optional(),
  /**
   * Present if the server offers any tools to call.
   */
  tools: object({
    /**
     * Whether this server supports issuing notifications for changes to the tool list.
     */
    listChanged: boolean2().optional()
  }).optional(),
  /**
   * Present if the server supports task creation.
   */
  tasks: ServerTasksCapabilitySchema.optional(),
  /**
   * Extensions that the server supports. Keys are extension identifiers (vendor-prefix/extension-name).
   */
  extensions: record(string2(), AssertObjectSchema).optional()
});
var InitializeResultSchema = ResultSchema.extend({
  /**
   * The version of the Model Context Protocol that the server wants to use. This may not match the version that the client requested. If the client cannot support this version, it MUST disconnect.
   */
  protocolVersion: string2(),
  capabilities: ServerCapabilitiesSchema,
  serverInfo: ImplementationSchema,
  /**
   * Instructions describing how to use the server and its features.
   *
   * This can be used by clients to improve the LLM's understanding of available tools, resources, etc. It can be thought of like a "hint" to the model. For example, this information MAY be added to the system prompt.
   */
  instructions: string2().optional()
});
var InitializedNotificationSchema = NotificationSchema.extend({
  method: literal("notifications/initialized"),
  params: NotificationsParamsSchema.optional()
});
var PingRequestSchema = RequestSchema.extend({
  method: literal("ping"),
  params: BaseRequestParamsSchema.optional()
});
var ProgressSchema = object({
  /**
   * The progress thus far. This should increase every time progress is made, even if the total is unknown.
   */
  progress: number2(),
  /**
   * Total number of items to process (or total progress required), if known.
   */
  total: optional2(number2()),
  /**
   * An optional message describing the current progress.
   */
  message: optional2(string2())
});
var ProgressNotificationParamsSchema = object({
  ...NotificationsParamsSchema.shape,
  ...ProgressSchema.shape,
  /**
   * The progress token which was given in the initial request, used to associate this notification with the request that is proceeding.
   */
  progressToken: ProgressTokenSchema
});
var ProgressNotificationSchema = NotificationSchema.extend({
  method: literal("notifications/progress"),
  params: ProgressNotificationParamsSchema
});
var PaginatedRequestParamsSchema = BaseRequestParamsSchema.extend({
  /**
   * An opaque token representing the current pagination position.
   * If provided, the server should return results starting after this cursor.
   */
  cursor: CursorSchema.optional()
});
var PaginatedRequestSchema = RequestSchema.extend({
  params: PaginatedRequestParamsSchema.optional()
});
var PaginatedResultSchema = ResultSchema.extend({
  /**
   * An opaque token representing the pagination position after the last returned result.
   * If present, there may be more results available.
   */
  nextCursor: CursorSchema.optional()
});
var TaskStatusSchema = _enum(["working", "input_required", "completed", "failed", "cancelled"]);
var TaskSchema = object({
  taskId: string2(),
  status: TaskStatusSchema,
  /**
   * Time in milliseconds to keep task results available after completion.
   * If null, the task has unlimited lifetime until manually cleaned up.
   */
  ttl: union([number2(), _null3()]),
  /**
   * ISO 8601 timestamp when the task was created.
   */
  createdAt: string2(),
  /**
   * ISO 8601 timestamp when the task was last updated.
   */
  lastUpdatedAt: string2(),
  pollInterval: optional2(number2()),
  /**
   * Optional diagnostic message for failed tasks or other status information.
   */
  statusMessage: optional2(string2())
});
var CreateTaskResultSchema = ResultSchema.extend({
  task: TaskSchema
});
var TaskStatusNotificationParamsSchema = NotificationsParamsSchema.merge(TaskSchema);
var TaskStatusNotificationSchema = NotificationSchema.extend({
  method: literal("notifications/tasks/status"),
  params: TaskStatusNotificationParamsSchema
});
var GetTaskRequestSchema = RequestSchema.extend({
  method: literal("tasks/get"),
  params: BaseRequestParamsSchema.extend({
    taskId: string2()
  })
});
var GetTaskResultSchema = ResultSchema.merge(TaskSchema);
var GetTaskPayloadRequestSchema = RequestSchema.extend({
  method: literal("tasks/result"),
  params: BaseRequestParamsSchema.extend({
    taskId: string2()
  })
});
var GetTaskPayloadResultSchema = ResultSchema.loose();
var ListTasksRequestSchema = PaginatedRequestSchema.extend({
  method: literal("tasks/list")
});
var ListTasksResultSchema = PaginatedResultSchema.extend({
  tasks: array2(TaskSchema)
});
var CancelTaskRequestSchema = RequestSchema.extend({
  method: literal("tasks/cancel"),
  params: BaseRequestParamsSchema.extend({
    taskId: string2()
  })
});
var CancelTaskResultSchema = ResultSchema.merge(TaskSchema);
var ResourceContentsSchema = object({
  /**
   * The URI of this resource.
   */
  uri: string2(),
  /**
   * The MIME type of this resource, if known.
   */
  mimeType: optional2(string2()),
  /**
   * See [MCP specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/47339c03c143bb4ec01a26e721a1b8fe66634ebe/docs/specification/draft/basic/index.mdx#general-fields)
   * for notes on _meta usage.
   */
  _meta: record(string2(), unknown()).optional()
});
var TextResourceContentsSchema = ResourceContentsSchema.extend({
  /**
   * The text of the item. This must only be set if the item can actually be represented as text (not binary data).
   */
  text: string2()
});
var Base64Schema = string2().refine((val) => {
  try {
    atob(val);
    return true;
  } catch {
    return false;
  }
}, { message: "Invalid Base64 string" });
var BlobResourceContentsSchema = ResourceContentsSchema.extend({
  /**
   * A base64-encoded string representing the binary data of the item.
   */
  blob: Base64Schema
});
var RoleSchema = _enum(["user", "assistant"]);
var AnnotationsSchema = object({
  /**
   * Intended audience(s) for the resource.
   */
  audience: array2(RoleSchema).optional(),
  /**
   * Importance hint for the resource, from 0 (least) to 1 (most).
   */
  priority: number2().min(0).max(1).optional(),
  /**
   * ISO 8601 timestamp for the most recent modification.
   */
  lastModified: iso_exports.datetime({ offset: true }).optional()
});
var ResourceSchema = object({
  ...BaseMetadataSchema.shape,
  ...IconsSchema.shape,
  /**
   * The URI of this resource.
   */
  uri: string2(),
  /**
   * A description of what this resource represents.
   *
   * This can be used by clients to improve the LLM's understanding of available resources. It can be thought of like a "hint" to the model.
   */
  description: optional2(string2()),
  /**
   * The MIME type of this resource, if known.
   */
  mimeType: optional2(string2()),
  /**
   * The size of the raw resource content, in bytes (i.e., before base64 encoding or any tokenization), if known.
   *
   * This can be used by Hosts to display file sizes and estimate context window usage.
   */
  size: optional2(number2()),
  /**
   * Optional annotations for the client.
   */
  annotations: AnnotationsSchema.optional(),
  /**
   * See [MCP specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/47339c03c143bb4ec01a26e721a1b8fe66634ebe/docs/specification/draft/basic/index.mdx#general-fields)
   * for notes on _meta usage.
   */
  _meta: optional2(looseObject({}))
});
var ResourceTemplateSchema = object({
  ...BaseMetadataSchema.shape,
  ...IconsSchema.shape,
  /**
   * A URI template (according to RFC 6570) that can be used to construct resource URIs.
   */
  uriTemplate: string2(),
  /**
   * A description of what this template is for.
   *
   * This can be used by clients to improve the LLM's understanding of available resources. It can be thought of like a "hint" to the model.
   */
  description: optional2(string2()),
  /**
   * The MIME type for all resources that match this template. This should only be included if all resources matching this template have the same type.
   */
  mimeType: optional2(string2()),
  /**
   * Optional annotations for the client.
   */
  annotations: AnnotationsSchema.optional(),
  /**
   * See [MCP specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/47339c03c143bb4ec01a26e721a1b8fe66634ebe/docs/specification/draft/basic/index.mdx#general-fields)
   * for notes on _meta usage.
   */
  _meta: optional2(looseObject({}))
});
var ListResourcesRequestSchema = PaginatedRequestSchema.extend({
  method: literal("resources/list")
});
var ListResourcesResultSchema = PaginatedResultSchema.extend({
  resources: array2(ResourceSchema)
});
var ListResourceTemplatesRequestSchema = PaginatedRequestSchema.extend({
  method: literal("resources/templates/list")
});
var ListResourceTemplatesResultSchema = PaginatedResultSchema.extend({
  resourceTemplates: array2(ResourceTemplateSchema)
});
var ResourceRequestParamsSchema = BaseRequestParamsSchema.extend({
  /**
   * The URI of the resource to read. The URI can use any protocol; it is up to the server how to interpret it.
   *
   * @format uri
   */
  uri: string2()
});
var ReadResourceRequestParamsSchema = ResourceRequestParamsSchema;
var ReadResourceRequestSchema = RequestSchema.extend({
  method: literal("resources/read"),
  params: ReadResourceRequestParamsSchema
});
var ReadResourceResultSchema = ResultSchema.extend({
  contents: array2(union([TextResourceContentsSchema, BlobResourceContentsSchema]))
});
var ResourceListChangedNotificationSchema = NotificationSchema.extend({
  method: literal("notifications/resources/list_changed"),
  params: NotificationsParamsSchema.optional()
});
var SubscribeRequestParamsSchema = ResourceRequestParamsSchema;
var SubscribeRequestSchema = RequestSchema.extend({
  method: literal("resources/subscribe"),
  params: SubscribeRequestParamsSchema
});
var UnsubscribeRequestParamsSchema = ResourceRequestParamsSchema;
var UnsubscribeRequestSchema = RequestSchema.extend({
  method: literal("resources/unsubscribe"),
  params: UnsubscribeRequestParamsSchema
});
var ResourceUpdatedNotificationParamsSchema = NotificationsParamsSchema.extend({
  /**
   * The URI of the resource that has been updated. This might be a sub-resource of the one that the client actually subscribed to.
   */
  uri: string2()
});
var ResourceUpdatedNotificationSchema = NotificationSchema.extend({
  method: literal("notifications/resources/updated"),
  params: ResourceUpdatedNotificationParamsSchema
});
var PromptArgumentSchema = object({
  /**
   * The name of the argument.
   */
  name: string2(),
  /**
   * A human-readable description of the argument.
   */
  description: optional2(string2()),
  /**
   * Whether this argument must be provided.
   */
  required: optional2(boolean2())
});
var PromptSchema = object({
  ...BaseMetadataSchema.shape,
  ...IconsSchema.shape,
  /**
   * An optional description of what this prompt provides
   */
  description: optional2(string2()),
  /**
   * A list of arguments to use for templating the prompt.
   */
  arguments: optional2(array2(PromptArgumentSchema)),
  /**
   * See [MCP specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/47339c03c143bb4ec01a26e721a1b8fe66634ebe/docs/specification/draft/basic/index.mdx#general-fields)
   * for notes on _meta usage.
   */
  _meta: optional2(looseObject({}))
});
var ListPromptsRequestSchema = PaginatedRequestSchema.extend({
  method: literal("prompts/list")
});
var ListPromptsResultSchema = PaginatedResultSchema.extend({
  prompts: array2(PromptSchema)
});
var GetPromptRequestParamsSchema = BaseRequestParamsSchema.extend({
  /**
   * The name of the prompt or prompt template.
   */
  name: string2(),
  /**
   * Arguments to use for templating the prompt.
   */
  arguments: record(string2(), string2()).optional()
});
var GetPromptRequestSchema = RequestSchema.extend({
  method: literal("prompts/get"),
  params: GetPromptRequestParamsSchema
});
var TextContentSchema = object({
  type: literal("text"),
  /**
   * The text content of the message.
   */
  text: string2(),
  /**
   * Optional annotations for the client.
   */
  annotations: AnnotationsSchema.optional(),
  /**
   * See [MCP specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/47339c03c143bb4ec01a26e721a1b8fe66634ebe/docs/specification/draft/basic/index.mdx#general-fields)
   * for notes on _meta usage.
   */
  _meta: record(string2(), unknown()).optional()
});
var ImageContentSchema = object({
  type: literal("image"),
  /**
   * The base64-encoded image data.
   */
  data: Base64Schema,
  /**
   * The MIME type of the image. Different providers may support different image types.
   */
  mimeType: string2(),
  /**
   * Optional annotations for the client.
   */
  annotations: AnnotationsSchema.optional(),
  /**
   * See [MCP specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/47339c03c143bb4ec01a26e721a1b8fe66634ebe/docs/specification/draft/basic/index.mdx#general-fields)
   * for notes on _meta usage.
   */
  _meta: record(string2(), unknown()).optional()
});
var AudioContentSchema = object({
  type: literal("audio"),
  /**
   * The base64-encoded audio data.
   */
  data: Base64Schema,
  /**
   * The MIME type of the audio. Different providers may support different audio types.
   */
  mimeType: string2(),
  /**
   * Optional annotations for the client.
   */
  annotations: AnnotationsSchema.optional(),
  /**
   * See [MCP specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/47339c03c143bb4ec01a26e721a1b8fe66634ebe/docs/specification/draft/basic/index.mdx#general-fields)
   * for notes on _meta usage.
   */
  _meta: record(string2(), unknown()).optional()
});
var ToolUseContentSchema = object({
  type: literal("tool_use"),
  /**
   * The name of the tool to invoke.
   * Must match a tool name from the request's tools array.
   */
  name: string2(),
  /**
   * Unique identifier for this tool call.
   * Used to correlate with ToolResultContent in subsequent messages.
   */
  id: string2(),
  /**
   * Arguments to pass to the tool.
   * Must conform to the tool's inputSchema.
   */
  input: record(string2(), unknown()),
  /**
   * See [MCP specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/47339c03c143bb4ec01a26e721a1b8fe66634ebe/docs/specification/draft/basic/index.mdx#general-fields)
   * for notes on _meta usage.
   */
  _meta: record(string2(), unknown()).optional()
});
var EmbeddedResourceSchema = object({
  type: literal("resource"),
  resource: union([TextResourceContentsSchema, BlobResourceContentsSchema]),
  /**
   * Optional annotations for the client.
   */
  annotations: AnnotationsSchema.optional(),
  /**
   * See [MCP specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/47339c03c143bb4ec01a26e721a1b8fe66634ebe/docs/specification/draft/basic/index.mdx#general-fields)
   * for notes on _meta usage.
   */
  _meta: record(string2(), unknown()).optional()
});
var ResourceLinkSchema = ResourceSchema.extend({
  type: literal("resource_link")
});
var ContentBlockSchema = union([
  TextContentSchema,
  ImageContentSchema,
  AudioContentSchema,
  ResourceLinkSchema,
  EmbeddedResourceSchema
]);
var PromptMessageSchema = object({
  role: RoleSchema,
  content: ContentBlockSchema
});
var GetPromptResultSchema = ResultSchema.extend({
  /**
   * An optional description for the prompt.
   */
  description: string2().optional(),
  messages: array2(PromptMessageSchema)
});
var PromptListChangedNotificationSchema = NotificationSchema.extend({
  method: literal("notifications/prompts/list_changed"),
  params: NotificationsParamsSchema.optional()
});
var ToolAnnotationsSchema = object({
  /**
   * A human-readable title for the tool.
   */
  title: string2().optional(),
  /**
   * If true, the tool does not modify its environment.
   *
   * Default: false
   */
  readOnlyHint: boolean2().optional(),
  /**
   * If true, the tool may perform destructive updates to its environment.
   * If false, the tool performs only additive updates.
   *
   * (This property is meaningful only when `readOnlyHint == false`)
   *
   * Default: true
   */
  destructiveHint: boolean2().optional(),
  /**
   * If true, calling the tool repeatedly with the same arguments
   * will have no additional effect on the its environment.
   *
   * (This property is meaningful only when `readOnlyHint == false`)
   *
   * Default: false
   */
  idempotentHint: boolean2().optional(),
  /**
   * If true, this tool may interact with an "open world" of external
   * entities. If false, the tool's domain of interaction is closed.
   * For example, the world of a web search tool is open, whereas that
   * of a memory tool is not.
   *
   * Default: true
   */
  openWorldHint: boolean2().optional()
});
var ToolExecutionSchema = object({
  /**
   * Indicates the tool's preference for task-augmented execution.
   * - "required": Clients MUST invoke the tool as a task
   * - "optional": Clients MAY invoke the tool as a task or normal request
   * - "forbidden": Clients MUST NOT attempt to invoke the tool as a task
   *
   * If not present, defaults to "forbidden".
   */
  taskSupport: _enum(["required", "optional", "forbidden"]).optional()
});
var ToolSchema = object({
  ...BaseMetadataSchema.shape,
  ...IconsSchema.shape,
  /**
   * A human-readable description of the tool.
   */
  description: string2().optional(),
  /**
   * A JSON Schema 2020-12 object defining the expected parameters for the tool.
   * Must have type: 'object' at the root level per MCP spec.
   */
  inputSchema: object({
    type: literal("object"),
    properties: record(string2(), AssertObjectSchema).optional(),
    required: array2(string2()).optional()
  }).catchall(unknown()),
  /**
   * An optional JSON Schema 2020-12 object defining the structure of the tool's output
   * returned in the structuredContent field of a CallToolResult.
   * Must have type: 'object' at the root level per MCP spec.
   */
  outputSchema: object({
    type: literal("object"),
    properties: record(string2(), AssertObjectSchema).optional(),
    required: array2(string2()).optional()
  }).catchall(unknown()).optional(),
  /**
   * Optional additional tool information.
   */
  annotations: ToolAnnotationsSchema.optional(),
  /**
   * Execution-related properties for this tool.
   */
  execution: ToolExecutionSchema.optional(),
  /**
   * See [MCP specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/47339c03c143bb4ec01a26e721a1b8fe66634ebe/docs/specification/draft/basic/index.mdx#general-fields)
   * for notes on _meta usage.
   */
  _meta: record(string2(), unknown()).optional()
});
var ListToolsRequestSchema = PaginatedRequestSchema.extend({
  method: literal("tools/list")
});
var ListToolsResultSchema = PaginatedResultSchema.extend({
  tools: array2(ToolSchema)
});
var CallToolResultSchema = ResultSchema.extend({
  /**
   * A list of content objects that represent the result of the tool call.
   *
   * If the Tool does not define an outputSchema, this field MUST be present in the result.
   * For backwards compatibility, this field is always present, but it may be empty.
   */
  content: array2(ContentBlockSchema).default([]),
  /**
   * An object containing structured tool output.
   *
   * If the Tool defines an outputSchema, this field MUST be present in the result, and contain a JSON object that matches the schema.
   */
  structuredContent: record(string2(), unknown()).optional(),
  /**
   * Whether the tool call ended in an error.
   *
   * If not set, this is assumed to be false (the call was successful).
   *
   * Any errors that originate from the tool SHOULD be reported inside the result
   * object, with `isError` set to true, _not_ as an MCP protocol-level error
   * response. Otherwise, the LLM would not be able to see that an error occurred
   * and self-correct.
   *
   * However, any errors in _finding_ the tool, an error indicating that the
   * server does not support tool calls, or any other exceptional conditions,
   * should be reported as an MCP error response.
   */
  isError: boolean2().optional()
});
var CompatibilityCallToolResultSchema = CallToolResultSchema.or(ResultSchema.extend({
  toolResult: unknown()
}));
var CallToolRequestParamsSchema = TaskAugmentedRequestParamsSchema.extend({
  /**
   * The name of the tool to call.
   */
  name: string2(),
  /**
   * Arguments to pass to the tool.
   */
  arguments: record(string2(), unknown()).optional()
});
var CallToolRequestSchema = RequestSchema.extend({
  method: literal("tools/call"),
  params: CallToolRequestParamsSchema
});
var ToolListChangedNotificationSchema = NotificationSchema.extend({
  method: literal("notifications/tools/list_changed"),
  params: NotificationsParamsSchema.optional()
});
var ListChangedOptionsBaseSchema = object({
  /**
   * If true, the list will be refreshed automatically when a list changed notification is received.
   * The callback will be called with the updated list.
   *
   * If false, the callback will be called with null items, allowing manual refresh.
   *
   * @default true
   */
  autoRefresh: boolean2().default(true),
  /**
   * Debounce time in milliseconds for list changed notification processing.
   *
   * Multiple notifications received within this timeframe will only trigger one refresh.
   * Set to 0 to disable debouncing.
   *
   * @default 300
   */
  debounceMs: number2().int().nonnegative().default(300)
});
var LoggingLevelSchema = _enum(["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"]);
var SetLevelRequestParamsSchema = BaseRequestParamsSchema.extend({
  /**
   * The level of logging that the client wants to receive from the server. The server should send all logs at this level and higher (i.e., more severe) to the client as notifications/logging/message.
   */
  level: LoggingLevelSchema
});
var SetLevelRequestSchema = RequestSchema.extend({
  method: literal("logging/setLevel"),
  params: SetLevelRequestParamsSchema
});
var LoggingMessageNotificationParamsSchema = NotificationsParamsSchema.extend({
  /**
   * The severity of this log message.
   */
  level: LoggingLevelSchema,
  /**
   * An optional name of the logger issuing this message.
   */
  logger: string2().optional(),
  /**
   * The data to be logged, such as a string message or an object. Any JSON serializable type is allowed here.
   */
  data: unknown()
});
var LoggingMessageNotificationSchema = NotificationSchema.extend({
  method: literal("notifications/message"),
  params: LoggingMessageNotificationParamsSchema
});
var ModelHintSchema = object({
  /**
   * A hint for a model name.
   */
  name: string2().optional()
});
var ModelPreferencesSchema = object({
  /**
   * Optional hints to use for model selection.
   */
  hints: array2(ModelHintSchema).optional(),
  /**
   * How much to prioritize cost when selecting a model.
   */
  costPriority: number2().min(0).max(1).optional(),
  /**
   * How much to prioritize sampling speed (latency) when selecting a model.
   */
  speedPriority: number2().min(0).max(1).optional(),
  /**
   * How much to prioritize intelligence and capabilities when selecting a model.
   */
  intelligencePriority: number2().min(0).max(1).optional()
});
var ToolChoiceSchema = object({
  /**
   * Controls when tools are used:
   * - "auto": Model decides whether to use tools (default)
   * - "required": Model MUST use at least one tool before completing
   * - "none": Model MUST NOT use any tools
   */
  mode: _enum(["auto", "required", "none"]).optional()
});
var ToolResultContentSchema = object({
  type: literal("tool_result"),
  toolUseId: string2().describe("The unique identifier for the corresponding tool call."),
  content: array2(ContentBlockSchema).default([]),
  structuredContent: object({}).loose().optional(),
  isError: boolean2().optional(),
  /**
   * See [MCP specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/47339c03c143bb4ec01a26e721a1b8fe66634ebe/docs/specification/draft/basic/index.mdx#general-fields)
   * for notes on _meta usage.
   */
  _meta: record(string2(), unknown()).optional()
});
var SamplingContentSchema = discriminatedUnion("type", [TextContentSchema, ImageContentSchema, AudioContentSchema]);
var SamplingMessageContentBlockSchema = discriminatedUnion("type", [
  TextContentSchema,
  ImageContentSchema,
  AudioContentSchema,
  ToolUseContentSchema,
  ToolResultContentSchema
]);
var SamplingMessageSchema = object({
  role: RoleSchema,
  content: union([SamplingMessageContentBlockSchema, array2(SamplingMessageContentBlockSchema)]),
  /**
   * See [MCP specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/47339c03c143bb4ec01a26e721a1b8fe66634ebe/docs/specification/draft/basic/index.mdx#general-fields)
   * for notes on _meta usage.
   */
  _meta: record(string2(), unknown()).optional()
});
var CreateMessageRequestParamsSchema = TaskAugmentedRequestParamsSchema.extend({
  messages: array2(SamplingMessageSchema),
  /**
   * The server's preferences for which model to select. The client MAY modify or omit this request.
   */
  modelPreferences: ModelPreferencesSchema.optional(),
  /**
   * An optional system prompt the server wants to use for sampling. The client MAY modify or omit this prompt.
   */
  systemPrompt: string2().optional(),
  /**
   * A request to include context from one or more MCP servers (including the caller), to be attached to the prompt.
   * The client MAY ignore this request.
   *
   * Default is "none". Values "thisServer" and "allServers" are soft-deprecated. Servers SHOULD only use these values if the client
   * declares ClientCapabilities.sampling.context. These values may be removed in future spec releases.
   */
  includeContext: _enum(["none", "thisServer", "allServers"]).optional(),
  temperature: number2().optional(),
  /**
   * The requested maximum number of tokens to sample (to prevent runaway completions).
   *
   * The client MAY choose to sample fewer tokens than the requested maximum.
   */
  maxTokens: number2().int(),
  stopSequences: array2(string2()).optional(),
  /**
   * Optional metadata to pass through to the LLM provider. The format of this metadata is provider-specific.
   */
  metadata: AssertObjectSchema.optional(),
  /**
   * Tools that the model may use during generation.
   * The client MUST return an error if this field is provided but ClientCapabilities.sampling.tools is not declared.
   */
  tools: array2(ToolSchema).optional(),
  /**
   * Controls how the model uses tools.
   * The client MUST return an error if this field is provided but ClientCapabilities.sampling.tools is not declared.
   * Default is `{ mode: "auto" }`.
   */
  toolChoice: ToolChoiceSchema.optional()
});
var CreateMessageRequestSchema = RequestSchema.extend({
  method: literal("sampling/createMessage"),
  params: CreateMessageRequestParamsSchema
});
var CreateMessageResultSchema = ResultSchema.extend({
  /**
   * The name of the model that generated the message.
   */
  model: string2(),
  /**
   * The reason why sampling stopped, if known.
   *
   * Standard values:
   * - "endTurn": Natural end of the assistant's turn
   * - "stopSequence": A stop sequence was encountered
   * - "maxTokens": Maximum token limit was reached
   *
   * This field is an open string to allow for provider-specific stop reasons.
   */
  stopReason: optional2(_enum(["endTurn", "stopSequence", "maxTokens"]).or(string2())),
  role: RoleSchema,
  /**
   * Response content. Single content block (text, image, or audio).
   */
  content: SamplingContentSchema
});
var CreateMessageResultWithToolsSchema = ResultSchema.extend({
  /**
   * The name of the model that generated the message.
   */
  model: string2(),
  /**
   * The reason why sampling stopped, if known.
   *
   * Standard values:
   * - "endTurn": Natural end of the assistant's turn
   * - "stopSequence": A stop sequence was encountered
   * - "maxTokens": Maximum token limit was reached
   * - "toolUse": The model wants to use one or more tools
   *
   * This field is an open string to allow for provider-specific stop reasons.
   */
  stopReason: optional2(_enum(["endTurn", "stopSequence", "maxTokens", "toolUse"]).or(string2())),
  role: RoleSchema,
  /**
   * Response content. May be a single block or array. May include ToolUseContent if stopReason is "toolUse".
   */
  content: union([SamplingMessageContentBlockSchema, array2(SamplingMessageContentBlockSchema)])
});
var BooleanSchemaSchema = object({
  type: literal("boolean"),
  title: string2().optional(),
  description: string2().optional(),
  default: boolean2().optional()
});
var StringSchemaSchema = object({
  type: literal("string"),
  title: string2().optional(),
  description: string2().optional(),
  minLength: number2().optional(),
  maxLength: number2().optional(),
  format: _enum(["email", "uri", "date", "date-time"]).optional(),
  default: string2().optional()
});
var NumberSchemaSchema = object({
  type: _enum(["number", "integer"]),
  title: string2().optional(),
  description: string2().optional(),
  minimum: number2().optional(),
  maximum: number2().optional(),
  default: number2().optional()
});
var UntitledSingleSelectEnumSchemaSchema = object({
  type: literal("string"),
  title: string2().optional(),
  description: string2().optional(),
  enum: array2(string2()),
  default: string2().optional()
});
var TitledSingleSelectEnumSchemaSchema = object({
  type: literal("string"),
  title: string2().optional(),
  description: string2().optional(),
  oneOf: array2(object({
    const: string2(),
    title: string2()
  })),
  default: string2().optional()
});
var LegacyTitledEnumSchemaSchema = object({
  type: literal("string"),
  title: string2().optional(),
  description: string2().optional(),
  enum: array2(string2()),
  enumNames: array2(string2()).optional(),
  default: string2().optional()
});
var SingleSelectEnumSchemaSchema = union([UntitledSingleSelectEnumSchemaSchema, TitledSingleSelectEnumSchemaSchema]);
var UntitledMultiSelectEnumSchemaSchema = object({
  type: literal("array"),
  title: string2().optional(),
  description: string2().optional(),
  minItems: number2().optional(),
  maxItems: number2().optional(),
  items: object({
    type: literal("string"),
    enum: array2(string2())
  }),
  default: array2(string2()).optional()
});
var TitledMultiSelectEnumSchemaSchema = object({
  type: literal("array"),
  title: string2().optional(),
  description: string2().optional(),
  minItems: number2().optional(),
  maxItems: number2().optional(),
  items: object({
    anyOf: array2(object({
      const: string2(),
      title: string2()
    }))
  }),
  default: array2(string2()).optional()
});
var MultiSelectEnumSchemaSchema = union([UntitledMultiSelectEnumSchemaSchema, TitledMultiSelectEnumSchemaSchema]);
var EnumSchemaSchema = union([LegacyTitledEnumSchemaSchema, SingleSelectEnumSchemaSchema, MultiSelectEnumSchemaSchema]);
var PrimitiveSchemaDefinitionSchema = union([EnumSchemaSchema, BooleanSchemaSchema, StringSchemaSchema, NumberSchemaSchema]);
var ElicitRequestFormParamsSchema = TaskAugmentedRequestParamsSchema.extend({
  /**
   * The elicitation mode.
   *
   * Optional for backward compatibility. Clients MUST treat missing mode as "form".
   */
  mode: literal("form").optional(),
  /**
   * The message to present to the user describing what information is being requested.
   */
  message: string2(),
  /**
   * A restricted subset of JSON Schema.
   * Only top-level properties are allowed, without nesting.
   */
  requestedSchema: object({
    type: literal("object"),
    properties: record(string2(), PrimitiveSchemaDefinitionSchema),
    required: array2(string2()).optional()
  })
});
var ElicitRequestURLParamsSchema = TaskAugmentedRequestParamsSchema.extend({
  /**
   * The elicitation mode.
   */
  mode: literal("url"),
  /**
   * The message to present to the user explaining why the interaction is needed.
   */
  message: string2(),
  /**
   * The ID of the elicitation, which must be unique within the context of the server.
   * The client MUST treat this ID as an opaque value.
   */
  elicitationId: string2(),
  /**
   * The URL that the user should navigate to.
   */
  url: string2().url()
});
var ElicitRequestParamsSchema = union([ElicitRequestFormParamsSchema, ElicitRequestURLParamsSchema]);
var ElicitRequestSchema = RequestSchema.extend({
  method: literal("elicitation/create"),
  params: ElicitRequestParamsSchema
});
var ElicitationCompleteNotificationParamsSchema = NotificationsParamsSchema.extend({
  /**
   * The ID of the elicitation that completed.
   */
  elicitationId: string2()
});
var ElicitationCompleteNotificationSchema = NotificationSchema.extend({
  method: literal("notifications/elicitation/complete"),
  params: ElicitationCompleteNotificationParamsSchema
});
var ElicitResultSchema = ResultSchema.extend({
  /**
   * The user action in response to the elicitation.
   * - "accept": User submitted the form/confirmed the action
   * - "decline": User explicitly decline the action
   * - "cancel": User dismissed without making an explicit choice
   */
  action: _enum(["accept", "decline", "cancel"]),
  /**
   * The submitted form data, only present when action is "accept".
   * Contains values matching the requested schema.
   * Per MCP spec, content is "typically omitted" for decline/cancel actions.
   * We normalize null to undefined for leniency while maintaining type compatibility.
   */
  content: preprocess((val) => val === null ? void 0 : val, record(string2(), union([string2(), number2(), boolean2(), array2(string2())])).optional())
});
var ResourceTemplateReferenceSchema = object({
  type: literal("ref/resource"),
  /**
   * The URI or URI template of the resource.
   */
  uri: string2()
});
var PromptReferenceSchema = object({
  type: literal("ref/prompt"),
  /**
   * The name of the prompt or prompt template
   */
  name: string2()
});
var CompleteRequestParamsSchema = BaseRequestParamsSchema.extend({
  ref: union([PromptReferenceSchema, ResourceTemplateReferenceSchema]),
  /**
   * The argument's information
   */
  argument: object({
    /**
     * The name of the argument
     */
    name: string2(),
    /**
     * The value of the argument to use for completion matching.
     */
    value: string2()
  }),
  context: object({
    /**
     * Previously-resolved variables in a URI template or prompt.
     */
    arguments: record(string2(), string2()).optional()
  }).optional()
});
var CompleteRequestSchema = RequestSchema.extend({
  method: literal("completion/complete"),
  params: CompleteRequestParamsSchema
});
var CompleteResultSchema = ResultSchema.extend({
  completion: looseObject({
    /**
     * An array of completion values. Must not exceed 100 items.
     */
    values: array2(string2()).max(100),
    /**
     * The total number of completion options available. This can exceed the number of values actually sent in the response.
     */
    total: optional2(number2().int()),
    /**
     * Indicates whether there are additional completion options beyond those provided in the current response, even if the exact total is unknown.
     */
    hasMore: optional2(boolean2())
  })
});
var RootSchema = object({
  /**
   * The URI identifying the root. This *must* start with file:// for now.
   */
  uri: string2().startsWith("file://"),
  /**
   * An optional name for the root.
   */
  name: string2().optional(),
  /**
   * See [MCP specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/47339c03c143bb4ec01a26e721a1b8fe66634ebe/docs/specification/draft/basic/index.mdx#general-fields)
   * for notes on _meta usage.
   */
  _meta: record(string2(), unknown()).optional()
});
var ListRootsRequestSchema = RequestSchema.extend({
  method: literal("roots/list"),
  params: BaseRequestParamsSchema.optional()
});
var ListRootsResultSchema = ResultSchema.extend({
  roots: array2(RootSchema)
});
var RootsListChangedNotificationSchema = NotificationSchema.extend({
  method: literal("notifications/roots/list_changed"),
  params: NotificationsParamsSchema.optional()
});
var ClientRequestSchema = union([
  PingRequestSchema,
  InitializeRequestSchema,
  CompleteRequestSchema,
  SetLevelRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
  CallToolRequestSchema,
  ListToolsRequestSchema,
  GetTaskRequestSchema,
  GetTaskPayloadRequestSchema,
  ListTasksRequestSchema,
  CancelTaskRequestSchema
]);
var ClientNotificationSchema = union([
  CancelledNotificationSchema,
  ProgressNotificationSchema,
  InitializedNotificationSchema,
  RootsListChangedNotificationSchema,
  TaskStatusNotificationSchema
]);
var ClientResultSchema = union([
  EmptyResultSchema,
  CreateMessageResultSchema,
  CreateMessageResultWithToolsSchema,
  ElicitResultSchema,
  ListRootsResultSchema,
  GetTaskResultSchema,
  ListTasksResultSchema,
  CreateTaskResultSchema
]);
var ServerRequestSchema = union([
  PingRequestSchema,
  CreateMessageRequestSchema,
  ElicitRequestSchema,
  ListRootsRequestSchema,
  GetTaskRequestSchema,
  GetTaskPayloadRequestSchema,
  ListTasksRequestSchema,
  CancelTaskRequestSchema
]);
var ServerNotificationSchema = union([
  CancelledNotificationSchema,
  ProgressNotificationSchema,
  LoggingMessageNotificationSchema,
  ResourceUpdatedNotificationSchema,
  ResourceListChangedNotificationSchema,
  ToolListChangedNotificationSchema,
  PromptListChangedNotificationSchema,
  TaskStatusNotificationSchema,
  ElicitationCompleteNotificationSchema
]);
var ServerResultSchema = union([
  EmptyResultSchema,
  InitializeResultSchema,
  CompleteResultSchema,
  GetPromptResultSchema,
  ListPromptsResultSchema,
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ReadResourceResultSchema,
  CallToolResultSchema,
  ListToolsResultSchema,
  GetTaskResultSchema,
  ListTasksResultSchema,
  CreateTaskResultSchema
]);

// node_modules/@modelcontextprotocol/sdk/dist/esm/shared/stdio.js
var STDIO_DEFAULT_MAX_BUFFER_SIZE = 10 * 1024 * 1024;
var ReadBuffer = class {
  constructor(options) {
    this._maxBufferSize = options?.maxBufferSize ?? STDIO_DEFAULT_MAX_BUFFER_SIZE;
  }
  append(chunk) {
    const newSize = (this._buffer?.length ?? 0) + chunk.length;
    if (newSize > this._maxBufferSize) {
      this.clear();
      throw new Error(`ReadBuffer exceeded maximum size of ${this._maxBufferSize} bytes`);
    }
    this._buffer = this._buffer ? Buffer.concat([this._buffer, chunk]) : chunk;
  }
  readMessage() {
    if (!this._buffer) {
      return null;
    }
    const index = this._buffer.indexOf("\n");
    if (index === -1) {
      return null;
    }
    const line = this._buffer.toString("utf8", 0, index).replace(/\r$/, "");
    this._buffer = this._buffer.subarray(index + 1);
    return deserializeMessage(line);
  }
  clear() {
    this._buffer = void 0;
  }
};
function deserializeMessage(line) {
  return JSONRPCMessageSchema.parse(JSON.parse(line));
}
function serializeMessage(message) {
  return JSON.stringify(message) + "\n";
}

// src/browser/socket-transport.ts
var SocketServerTransport = class {
  constructor(socket) {
    this.socket = socket;
  }
  socket;
  onclose;
  onerror;
  onmessage;
  buffer = new ReadBuffer();
  started = false;
  closed = false;
  async start() {
    if (this.started) throw new Error("SocketServerTransport already started");
    this.started = true;
    this.socket.on("data", this.handleData);
    this.socket.on("error", this.handleError);
    this.socket.on("close", this.handleClose);
  }
  async send(message) {
    if (this.closed) throw new Error("socket transport is closed");
    const payload = serializeMessage(message);
    await new Promise((resolve5, reject) => {
      this.socket.write(payload, (error2) => error2 ? reject(error2) : resolve5());
    });
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    this.detach();
    this.buffer.clear();
    await new Promise((resolve5) => {
      if (this.socket.destroyed) return resolve5();
      this.socket.end(() => resolve5());
    });
    this.onclose?.();
  }
  handleData = (chunk) => {
    try {
      this.buffer.append(chunk);
      while (true) {
        const message = this.buffer.readMessage();
        if (message === null) break;
        this.onmessage?.(message);
      }
    } catch (error2) {
      this.onerror?.(error2 instanceof Error ? error2 : new Error(String(error2)));
    }
  };
  handleError = (error2) => {
    this.onerror?.(error2);
  };
  handleClose = () => {
    if (this.closed) return;
    this.closed = true;
    this.detach();
    this.buffer.clear();
    this.onclose?.();
  };
  detach() {
    this.socket.off("data", this.handleData);
    this.socket.off("error", this.handleError);
    this.socket.off("close", this.handleClose);
  }
};

// src/browser-supervisor.ts
var profileDir2 = resolveChromeProfileDir();
var endpoint = supervisorSocketPath(profileDir2);
var startupLockPath = supervisorStartupLockPath(profileDir2);
var host = new ResumeBrowserHost();
var sessions = /* @__PURE__ */ new Map();
var listener;
var closing = false;
var emptyTimer;
function processExists2(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error2) {
    return typeof error2 === "object" && error2 !== null && "code" in error2 && error2.code === "EPERM";
  }
}
async function acquireStartupLock() {
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      const handle = await open3(startupLockPath, "wx", 384);
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, started_at: (/* @__PURE__ */ new Date()).toISOString() })}
`, "utf8");
      await handle.sync();
      return handle;
    } catch (error2) {
      const code = typeof error2 === "object" && error2 !== null && "code" in error2 ? error2.code : void 0;
      if (code !== "EEXIST") throw error2;
      if (await endpointIsLive()) return null;
      try {
        const record2 = JSON.parse(await readFile3(startupLockPath, "utf8"));
        if (typeof record2.pid !== "number" || !processExists2(record2.pid)) {
          await unlink3(startupLockPath).catch(() => void 0);
          continue;
        }
      } catch {
        if (attempt >= 20) await unlink3(startupLockPath).catch(() => void 0);
        else await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
        continue;
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
    }
  }
  throw new Error("browser_supervisor_startup_timeout: another process did not finish starting");
}
async function releaseStartupLock(handle) {
  await handle.close().catch(() => void 0);
  await unlink3(startupLockPath).catch(() => void 0);
}
function reply(socket, value) {
  return new Promise((resolveReply, reject) => {
    socket.write(`${JSON.stringify(value)}
`, (error2) => error2 ? reject(error2) : resolveReply());
  });
}
async function endpointIsLive() {
  return await new Promise((resolveLive) => {
    const socket = createConnection(endpoint);
    const timer = setTimeout(() => {
      socket.destroy();
      resolveLive(false);
    }, 250);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolveLive(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolveLive(false);
    });
  });
}
async function prepareEndpoint() {
  if (process.platform === "win32") return true;
  if (await endpointIsLive()) return false;
  await unlink3(endpoint).catch(() => void 0);
  return true;
}
function scheduleEphemeralShutdown() {
  if (process.env.RESUME_COMPANION_SUPERVISOR_EPHEMERAL !== "1" || sessions.size > 0 || closing) return;
  clearTimeout(emptyTimer);
  emptyTimer = setTimeout(() => {
    void shutdown();
  }, 150);
}
async function attach(socket, hello) {
  clearTimeout(emptyTimer);
  const existing = sessions.get(hello.session_id);
  if (existing) {
    await existing.server.close();
    existing.socket.destroy();
    sessions.delete(hello.session_id);
  }
  const transport = new SocketServerTransport(socket);
  const server = await ResumeBrowserServer.create(host, hello.session_id);
  sessions.set(hello.session_id, { server, socket });
  socket.once("close", () => {
    const current = sessions.get(hello.session_id);
    if (current?.socket !== socket) return;
    sessions.delete(hello.session_id);
    host.releaseSession(hello.session_id);
    void server.close();
    scheduleEphemeralShutdown();
  });
  await reply(socket, {
    status: "ready",
    supervisor_version: RUNTIME_PLUGIN_VERSION,
    protocol: BROWSER_SUPERVISOR_PROTOCOL
  });
  await server.connect(transport);
}
async function handleHandshake(socket) {
  let buffer = Buffer.alloc(0);
  const timer = setTimeout(() => socket.destroy(), 5e3);
  const onData = (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.byteLength > 16 * 1024) {
      clearTimeout(timer);
      socket.destroy();
      return;
    }
    const newline = buffer.indexOf(10);
    if (newline === -1) return;
    clearTimeout(timer);
    socket.off("data", onData);
    if (newline !== buffer.length - 1) {
      socket.destroy(new Error("MCP payload arrived before supervisor handshake completed"));
      return;
    }
    void dispatchHandshake(socket, buffer.subarray(0, newline).toString("utf8"));
  };
  socket.on("data", onData);
}
async function dispatchHandshake(socket, line) {
  try {
    const hello = JSON.parse(line);
    if (hello.protocol !== BROWSER_SUPERVISOR_PROTOCOL) {
      await reply(socket, {
        status: "protocol_mismatch",
        supervisor_version: RUNTIME_PLUGIN_VERSION,
        protocol: BROWSER_SUPERVISOR_PROTOCOL,
        message: "browser supervisor protocol mismatch"
      });
      socket.end();
      return;
    }
    if (typeof hello.client_version !== "string" || typeof hello.session_id !== "string" || !hello.session_id) {
      await reply(socket, {
        status: "error",
        supervisor_version: RUNTIME_PLUGIN_VERSION,
        protocol: BROWSER_SUPERVISOR_PROTOCOL,
        message: "invalid supervisor handshake"
      });
      socket.end();
      return;
    }
    const newerClient = compareVersions(hello.client_version, RUNTIME_PLUGIN_VERSION) > 0;
    if (hello.kind === "upgrade") {
      if (!newerClient) {
        await reply(socket, {
          status: "error",
          supervisor_version: RUNTIME_PLUGIN_VERSION,
          protocol: BROWSER_SUPERVISOR_PROTOCOL,
          message: "only a newer client can upgrade the browser supervisor"
        });
        socket.end();
        return;
      }
      await reply(socket, { status: "shutting_down", supervisor_version: RUNTIME_PLUGIN_VERSION, protocol: BROWSER_SUPERVISOR_PROTOCOL });
      socket.end();
      return void setTimeout(() => {
        void shutdown();
      }, 20);
    }
    if (hello.kind === "shutdown") {
      await reply(socket, { status: "shutting_down", supervisor_version: RUNTIME_PLUGIN_VERSION, protocol: BROWSER_SUPERVISOR_PROTOCOL });
      socket.end();
      return void setTimeout(() => {
        void shutdown();
      }, 20);
    }
    if (hello.kind !== "connect") {
      await reply(socket, { status: "error", supervisor_version: RUNTIME_PLUGIN_VERSION, protocol: BROWSER_SUPERVISOR_PROTOCOL, message: "unsupported supervisor command" });
      socket.end();
      return;
    }
    if (newerClient) {
      await reply(socket, { status: "upgrade_required", supervisor_version: RUNTIME_PLUGIN_VERSION, protocol: BROWSER_SUPERVISOR_PROTOCOL });
      socket.end();
      return;
    }
    await attach(socket, hello);
  } catch (error2) {
    await reply(socket, {
      status: "error",
      supervisor_version: RUNTIME_PLUGIN_VERSION,
      protocol: BROWSER_SUPERVISOR_PROTOCOL,
      message: error2 instanceof Error ? error2.message.slice(0, 300) : String(error2).slice(0, 300)
    }).catch(() => void 0);
    socket.end();
  }
}
async function shutdown() {
  if (closing) return;
  closing = true;
  clearTimeout(emptyTimer);
  const active = [...sessions.values()];
  sessions.clear();
  await Promise.allSettled(active.map(async (session) => {
    await session.server.close();
    session.socket.destroy();
  }));
  await host.close();
  if (listener) await new Promise((resolveClose) => listener.close(() => resolveClose()));
  if (process.platform !== "win32") await unlink3(endpoint).catch(() => void 0);
  process.exit(0);
}
await ensureSupervisorRuntimeDir();
var startupLock = await acquireStartupLock();
if (!startupLock) process.exit(0);
try {
  if (!await prepareEndpoint()) {
    await releaseStartupLock(startupLock);
    process.exit(0);
  }
  listener = createServer2((socket) => {
    void handleHandshake(socket);
  });
  await new Promise((resolveListen, reject) => {
    listener.once("error", reject);
    listener.listen(endpoint, () => {
      listener.off("error", reject);
      resolveListen();
    });
  });
  if (process.platform !== "win32") await chmod3(endpoint, 384);
  await releaseStartupLock(startupLock);
} catch (error2) {
  await releaseStartupLock(startupLock);
  if (error2.code === "EADDRINUSE") process.exit(0);
  console.error(`Resume Browser supervisor failed: ${error2 instanceof Error ? error2.message : String(error2)}`);
  process.exit(1);
}
process.once("SIGTERM", () => {
  void shutdown();
});
process.once("SIGINT", () => {
  void shutdown();
});
scheduleEphemeralShutdown();
