#!/usr/bin/env node
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/resume-browser-server.ts
import { existsSync } from "node:fs";
import { dirname as dirname2, resolve as resolve2 } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
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
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
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
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
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
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
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
  flatten(mapper = (issue) => issue.message) {
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
  const error = new ZodError(issues);
  return error;
};

// node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
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
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
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
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
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
  const issue = makeIssue({
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
  ctx.common.issues.push(issue);
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
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
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
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
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
        const error = new ZodError(ctx.common.issues);
        this._error = error;
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
  refine(check, message) {
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
      const result = check(val);
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
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
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
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
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
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
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
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
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
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
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
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
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
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
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
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
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
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
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
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
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
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
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
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
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
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
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
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
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
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
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
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
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
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
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
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
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
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
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
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
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
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
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
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
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
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
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
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
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
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
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
  setKey(key, schema) {
    return this.augment({ [key]: schema });
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
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
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
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
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
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
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
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
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
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
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
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
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
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
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
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
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
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
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
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
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

// src/browser/form-engine.ts
import { createHash, randomUUID } from "node:crypto";
var DEFAULT_MAX_BYTES = 12e3;
var MAX_MAX_BYTES = 8e4;
var HISTORY_LIMIT = 8;
var ACTION_TIMEOUT = 4e3;
var sensitiveLabelPattern = /(身份证|证件|护照|手机号|联系电话|手机号码|电子邮箱|邮箱|住址|地址|账号|银行卡)/i;
var manualBoundaryPattern = /(最终提交|提交申请|立即申请|确认投递|声明|承诺|同意条款|上传|删除|支付|签署|验证码|密码)/i;
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
  return createHash("sha256").update(value).digest("hex").slice(0, 7);
}
function navigationId(url) {
  return `nav_${shortHash(url.split("#")[0] ?? url)}`;
}
function fieldKind(field) {
  if (field.type === "checkbox" || field.role === "checkbox" || field.role === "switch") return "checkbox";
  if (field.type === "radio" || field.role === "radio") return "radio";
  if (field.tag === "select") return "select";
  if (field.type === "date" || field.type === "month" || field.type === "datetime-local") return "date";
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
function maskSensitiveValue(label, value) {
  const text = cleanText(value);
  if (!text) return "";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return maskEmail(text);
  if (/^1\d{10}$/.test(text)) return `${text.slice(0, 3)}****${text.slice(-4)}`;
  if (/^\d{15}$|^\d{17}[\dXx]$/.test(text)) return `${text.slice(0, 3)}***********${text.slice(-4)}`;
  if (sensitiveLabelPattern.test(label)) {
    if (text.length <= 4) return "<masked>";
    return `${text.slice(0, 2)}***${text.slice(-2)}`;
  }
  return text;
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
function isRelevant(text, target, scope) {
  const normalizedText = normalize(text);
  const normalizedTarget = normalize(target);
  const normalizedScope = normalize(scope);
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
  return contentResult({ ok: false, error: { code, message, ...details } }, true);
}
function errorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/ambiguous/i.test(message)) return "target_ambiguous";
  if (/not found|unresolved|no candidate/i.test(message)) return "target_unresolved";
  if (/constraint/i.test(message)) return "constraint_violation";
  if (/manual_boundary/i.test(message)) return "manual_boundary";
  if (/unknown/i.test(message)) return "action_result_unknown";
  return "postcondition_failed";
}
function collectDomForm() {
  const text = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const visible = (element) => {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  };
  const ownLabel = (element) => {
    const aria = text(element.getAttribute("aria-label"));
    if (aria) return aria;
    const labelledBy = text(element.getAttribute("aria-labelledby"));
    if (labelledBy) {
      const resolved = labelledBy.split(/\s+/).map((id) => text(document.getElementById(id)?.textContent)).filter(Boolean).join(" ");
      if (resolved) return resolved;
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      const labels = Array.from(element.labels ?? []).map((label) => text(label.textContent)).filter(Boolean).join(" ");
      if (labels) return labels;
      if (element.id) {
        const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(element.id) : element.id.replace(/["\\]/g, "\\$&");
        const explicit = document.querySelector(`label[for="${escaped}"]`);
        if (explicit) return text(explicit.textContent);
      }
    }
    const item = element.closest('.ant-form-item, .el-form-item, .form-item, [data-field], [role="group"]');
    if (item) {
      const candidate = item.querySelector("label, .ant-form-item-label, .el-form-item__label, legend, [data-label]");
      if (candidate && candidate !== element) {
        const result = text(candidate.textContent);
        if (result) return result;
      }
    }
    const placeholder = text(element.getAttribute("placeholder"));
    if (placeholder) return placeholder;
    const name = text(element.getAttribute("name"));
    if (name) return name;
    return text(element.innerText || element.textContent).slice(0, 160);
  };
  const scopeOf = (element) => {
    let current = element.parentElement;
    for (let depth = 0; current && depth < 8; depth++, current = current.parentElement) {
      if (current.matches("fieldset")) {
        const legend = current.querySelector(":scope > legend");
        if (legend && text(legend.textContent)) return text(legend.textContent);
      }
      if (current.matches('section, article, form, [role="dialog"], [role="region"]')) {
        const aria = text(current.getAttribute("aria-label"));
        if (aria) return aria;
        const heading = current.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > header");
        if (heading && text(heading.textContent)) return text(heading.textContent);
      }
      const record = current.getAttribute("data-record-label");
      if (record) return text(record);
    }
    return "";
  };
  const valueOf = (element) => {
    if (element instanceof HTMLInputElement) {
      if (element.type === "checkbox" || element.type === "radio") return { value: element.value, checked: element.checked };
      if (element.type === "password") return { value: element.value ? "<present>" : "", checked: null };
      return { value: element.value, checked: null };
    }
    if (element instanceof HTMLTextAreaElement) return { value: element.value, checked: null };
    if (element instanceof HTMLSelectElement) {
      return { value: Array.from(element.selectedOptions).map((option) => text(option.textContent)).join(" / "), checked: null };
    }
    const role = element.getAttribute("role");
    if (role === "checkbox" || role === "radio" || role === "switch") {
      return { value: "", checked: element.getAttribute("aria-checked") === "true" };
    }
    if (element.isContentEditable) return { value: text(element.innerText), checked: null };
    return { value: text(element.getAttribute("aria-valuetext") || element.getAttribute("aria-valuenow") || ""), checked: null };
  };
  const selector = [
    'input:not([type="hidden"])',
    "textarea",
    "select",
    "button",
    '[contenteditable="true"]',
    '[role="textbox"]',
    '[role="combobox"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="button"]',
    '[role="treeitem"]',
    '[role="slider"]',
    '[role="spinbutton"]'
  ].join(",");
  const nodes = Array.from(document.querySelectorAll(selector));
  const fields = nodes.map((element, index) => {
    const value = valueOf(element);
    const input = element instanceof HTMLInputElement ? element : null;
    const control = element;
    const errorId = element.getAttribute("aria-errormessage");
    const error = errorId ? text(document.getElementById(errorId)?.textContent) : "";
    return {
      frame: 0,
      index,
      tag: element.tagName.toLowerCase(),
      role: text(element.getAttribute("role") || (element instanceof HTMLButtonElement ? "button" : "")),
      type: text(input?.type || element.getAttribute("type") || ""),
      label: ownLabel(element),
      scope: scopeOf(element),
      value: value.value,
      checked: value.checked,
      disabled: Boolean("disabled" in control && control.disabled) || element.getAttribute("aria-disabled") === "true",
      readonly: Boolean(input?.readOnly || element instanceof HTMLTextAreaElement && element.readOnly) || element.getAttribute("aria-readonly") === "true",
      required: Boolean("required" in control && control.required) || element.getAttribute("aria-required") === "true",
      visible: visible(element),
      options: element instanceof HTMLSelectElement ? Array.from(element.options).filter((option) => !option.disabled).map((option) => text(option.textContent)).filter(Boolean) : [],
      constraints: {
        minlength: "minLength" in control && control.minLength >= 0 ? control.minLength : null,
        maxlength: "maxLength" in control && control.maxLength >= 0 ? control.maxLength : null,
        min: text(element.getAttribute("min")) || null,
        max: text(element.getAttribute("max")) || null,
        step: text(element.getAttribute("step")) || null,
        pattern: text(element.getAttribute("pattern")) || null
      },
      invalid: element.getAttribute("aria-invalid") === "true" || Boolean("validity" in control && !control.validity.valid),
      error
    };
  }).filter((field) => field.label || field.role || field.type);
  const overlayNodes = Array.from(document.querySelectorAll('[role="listbox"], [role="menu"], [role="tree"], [role="dialog"], .ant-select-dropdown, .ant-cascader-menus, .ant-picker-dropdown, .el-select-dropdown, .el-cascader__dropdown, .el-picker-panel'));
  const overlays = overlayNodes.filter(visible).map((element) => ({
    frame: 0,
    role: text(element.getAttribute("role") || "overlay"),
    label: ownLabel(element) || text(element.getAttribute("aria-label")),
    options: Array.from(element.querySelectorAll('[role="option"], [role="treeitem"], [role="menuitem"], li, td, button')).filter(visible).map((option) => ownLabel(option) || text(option.textContent)).filter(Boolean).slice(0, 120)
  }));
  const sections = Array.from(document.querySelectorAll('h1, h2, h3, h4, fieldset > legend, section[aria-label], [role="region"][aria-label]')).filter(visible).map((element) => text(element.getAttribute("aria-label") || element.textContent)).filter(Boolean);
  const validations = Array.from(document.querySelectorAll('[role="alert"], [aria-live], .ant-form-item-explain-error, .el-form-item__error, .error, .invalid-feedback')).filter(visible).map((element) => text(element.textContent)).filter(Boolean).slice(0, 80);
  return { fields, overlays, sections, validations };
}
function findSemanticCandidates(spec) {
  const normalized2 = (value) => String(value ?? "").replace(/[\s*：:]+/g, "").trim().toLowerCase();
  const text = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const visible = (element) => {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const labelOf = (element) => {
    const aria = text(element.getAttribute("aria-label"));
    if (aria) return aria;
    const labelledBy = text(element.getAttribute("aria-labelledby"));
    if (labelledBy) {
      const resolved = labelledBy.split(/\s+/).map((id) => text(document.getElementById(id)?.textContent)).filter(Boolean).join(" ");
      if (resolved) return resolved;
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      const labels = Array.from(element.labels ?? []).map((label) => text(label.textContent)).filter(Boolean).join(" ");
      if (labels) return labels;
    }
    const item = element.closest('.ant-form-item, .el-form-item, .form-item, [data-field], [role="group"]');
    const itemLabel = item?.querySelector("label, .ant-form-item-label, .el-form-item__label, legend, [data-label]");
    if (itemLabel && itemLabel !== element && text(itemLabel.textContent)) return text(itemLabel.textContent);
    return text(element.getAttribute("placeholder") || element.getAttribute("name") || element.innerText || element.textContent).slice(0, 160);
  };
  const scopeOf = (element) => {
    let current = element.parentElement;
    for (let depth = 0; current && depth < 8; depth++, current = current.parentElement) {
      const record = current.getAttribute("data-record-label");
      if (record) return text(record);
      if (current.matches("fieldset")) {
        const legend = current.querySelector(":scope > legend");
        if (legend && text(legend.textContent)) return text(legend.textContent);
      }
      if (current.matches('section, article, form, [role="dialog"], [role="region"]')) {
        const aria = text(current.getAttribute("aria-label"));
        if (aria) return aria;
        const heading = current.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > header");
        if (heading && text(heading.textContent)) return text(heading.textContent);
      }
    }
    return "";
  };
  const valueOf = (element) => {
    if (element instanceof HTMLInputElement) return element.type === "checkbox" || element.type === "radio" ? { value: element.value, checked: element.checked } : { value: element.value, checked: null };
    if (element instanceof HTMLTextAreaElement) return { value: element.value, checked: null };
    if (element instanceof HTMLSelectElement) return { value: Array.from(element.selectedOptions).map((option) => text(option.textContent)).join(" / "), checked: null };
    const role = element.getAttribute("role");
    if (role === "checkbox" || role === "radio" || role === "switch") return { value: "", checked: element.getAttribute("aria-checked") === "true" };
    return { value: text(element.getAttribute("aria-valuetext") || element.innerText || ""), checked: null };
  };
  const selector = [
    'input:not([type="hidden"])',
    "textarea",
    "select",
    "button",
    '[contenteditable="true"]',
    '[role="textbox"]',
    '[role="combobox"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="button"]',
    '[role="option"]',
    '[role="treeitem"]',
    '[role="menuitem"]',
    ".ant-select-item-option",
    ".ant-cascader-menu-item",
    ".el-select-dropdown__item",
    ".el-cascader-node",
    "li"
  ].join(",");
  const target = normalized2(spec.option || spec.field);
  const scopeTarget = normalized2(spec.scope);
  const roleSet = new Set((spec.roles ?? []).map(normalized2));
  return Array.from(document.querySelectorAll(selector)).map((element, index) => {
    const label = labelOf(element);
    const scope = scopeOf(element);
    const labelNorm = normalized2(label);
    const scopeNorm = normalized2(scope);
    const role = text(element.getAttribute("role") || (element instanceof HTMLButtonElement ? "button" : ""));
    const type = element instanceof HTMLInputElement ? element.type : text(element.getAttribute("type"));
    let score = 0;
    if (labelNorm === target) score += 120;
    else if (target && labelNorm.includes(target)) score += 72;
    else if (target && target.includes(labelNorm) && labelNorm.length >= 2) score += 48;
    if (scopeTarget && scopeNorm === scopeTarget) score += 55;
    else if (scopeTarget && (scopeNorm.includes(scopeTarget) || scopeTarget.includes(scopeNorm))) score += 28;
    if (scopeTarget && !scopeNorm) score -= 12;
    if (roleSet.size && (roleSet.has(normalized2(role)) || roleSet.has(normalized2(type)) || roleSet.has(normalized2(element.tagName)))) score += 16;
    if (visible(element)) score += 12;
    else score -= 100;
    if (element.disabled || element.getAttribute("aria-disabled") === "true") score -= 30;
    const value = valueOf(element);
    const control = element;
    return {
      frame: 0,
      index,
      label,
      scope,
      tag: element.tagName.toLowerCase(),
      role,
      type,
      value: value.value,
      checked: value.checked,
      disabled: Boolean("disabled" in control && control.disabled) || element.getAttribute("aria-disabled") === "true",
      readonly: Boolean(element instanceof HTMLInputElement && element.readOnly || element instanceof HTMLTextAreaElement && element.readOnly) || element.getAttribute("aria-readonly") === "true",
      visible: visible(element),
      score,
      constraints: {
        minlength: "minLength" in control && control.minLength >= 0 ? control.minLength : null,
        maxlength: "maxLength" in control && control.maxLength >= 0 ? control.maxLength : null,
        min: text(element.getAttribute("min")) || null,
        max: text(element.getAttribute("max")) || null,
        step: text(element.getAttribute("step")) || null,
        pattern: text(element.getAttribute("pattern")) || null
      }
    };
  }).filter((candidate) => candidate.score > 0).sort((left, right) => right.score - left.score).slice(0, 20);
}
function resolveSemanticElement(spec) {
  const normalized2 = (value) => String(value ?? "").replace(/[\s*：:]+/g, "").trim().toLowerCase();
  const text = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const visible = (element) => {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const labelOf = (element) => {
    const aria = text(element.getAttribute("aria-label"));
    if (aria) return aria;
    const labelledBy = text(element.getAttribute("aria-labelledby"));
    if (labelledBy) {
      const resolved = labelledBy.split(/\s+/).map((id) => text(document.getElementById(id)?.textContent)).filter(Boolean).join(" ");
      if (resolved) return resolved;
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      const labels = Array.from(element.labels ?? []).map((label) => text(label.textContent)).filter(Boolean).join(" ");
      if (labels) return labels;
    }
    const item = element.closest('.ant-form-item, .el-form-item, .form-item, [data-field], [role="group"]');
    const itemLabel = item?.querySelector("label, .ant-form-item-label, .el-form-item__label, legend, [data-label]");
    if (itemLabel && itemLabel !== element && text(itemLabel.textContent)) return text(itemLabel.textContent);
    return text(element.getAttribute("placeholder") || element.getAttribute("name") || element.innerText || element.textContent).slice(0, 160);
  };
  const scopeOf = (element) => {
    let current = element.parentElement;
    for (let depth = 0; current && depth < 8; depth++, current = current.parentElement) {
      const record = current.getAttribute("data-record-label");
      if (record) return text(record);
      if (current.matches("fieldset")) {
        const legend = current.querySelector(":scope > legend");
        if (legend && text(legend.textContent)) return text(legend.textContent);
      }
      if (current.matches('section, article, form, [role="dialog"], [role="region"]')) {
        const aria = text(current.getAttribute("aria-label"));
        if (aria) return aria;
        const heading = current.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > header");
        if (heading && text(heading.textContent)) return text(heading.textContent);
      }
    }
    return "";
  };
  const selector = [
    'input:not([type="hidden"])',
    "textarea",
    "select",
    "button",
    '[contenteditable="true"]',
    '[role="textbox"]',
    '[role="combobox"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="button"]',
    '[role="option"]',
    '[role="treeitem"]',
    '[role="menuitem"]',
    ".ant-select-item-option",
    ".ant-cascader-menu-item",
    ".el-select-dropdown__item",
    ".el-cascader-node",
    "li"
  ].join(",");
  const target = normalized2(spec.option || spec.field);
  const scopeTarget = normalized2(spec.scope);
  const roleSet = new Set((spec.roles ?? []).map(normalized2));
  const ranked = Array.from(document.querySelectorAll(selector)).map((element) => {
    const label = labelOf(element);
    const scope = scopeOf(element);
    const labelNorm = normalized2(label);
    const scopeNorm = normalized2(scope);
    const role = text(element.getAttribute("role") || (element instanceof HTMLButtonElement ? "button" : ""));
    const type = element instanceof HTMLInputElement ? element.type : text(element.getAttribute("type"));
    let score = 0;
    if (labelNorm === target) score += 120;
    else if (target && labelNorm.includes(target)) score += 72;
    else if (target && target.includes(labelNorm) && labelNorm.length >= 2) score += 48;
    if (scopeTarget && scopeNorm === scopeTarget) score += 55;
    else if (scopeTarget && (scopeNorm.includes(scopeTarget) || scopeTarget.includes(scopeNorm))) score += 28;
    if (scopeTarget && !scopeNorm) score -= 12;
    if (roleSet.size && (roleSet.has(normalized2(role)) || roleSet.has(normalized2(type)) || roleSet.has(normalized2(element.tagName)))) score += 16;
    if (visible(element)) score += 12;
    else score -= 100;
    if (element.disabled || element.getAttribute("aria-disabled") === "true") score -= 30;
    return { element, score };
  }).filter((candidate) => candidate.score > 0).sort((left, right) => right.score - left.score);
  if (!ranked[0] || ranked[0].score === ranked[1]?.score) return null;
  return ranked[0].element;
}
function atomicSetValue(spec, rawValue) {
  const element = resolveSemanticElement(spec);
  if (!element) return { applied: false, value: null };
  if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
    const next = Boolean(rawValue);
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked");
    descriptor?.set?.call(element, next);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return { applied: true, value: element.checked };
  }
  if (element instanceof HTMLSelectElement) {
    const wanted = String(rawValue);
    const option = Array.from(element.options).find((item) => item.value === wanted || (item.textContent ?? "").trim() === wanted);
    if (!option || option.disabled) return { applied: false, value: element.value };
    const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
    descriptor?.set?.call(element, option.value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return { applied: true, value: (element.selectedOptions[0]?.textContent ?? element.value).trim() };
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const next = String(rawValue);
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor?.set?.call(element, next);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: next }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return { applied: true, value: element.value };
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    element.focus();
    element.textContent = String(rawValue);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(rawValue) }));
    return { applied: true, value: element.innerText };
  }
  return { applied: false, value: null };
}
function atomicClick(spec) {
  const element = resolveSemanticElement(spec);
  if (!(element instanceof HTMLElement)) return { applied: false };
  element.focus({ preventScroll: true });
  element.click();
  return { applied: true };
}
var FormEngine = class {
  constructor(getPage) {
    this.getPage = getPage;
  }
  getPage;
  states = /* @__PURE__ */ new Map();
  ledger = /* @__PURE__ */ new Map();
  completedOperations = /* @__PURE__ */ new Map();
  clear() {
    this.states.clear();
    this.ledger.clear();
    this.completedOperations.clear();
  }
  async observe(request) {
    const maxBytes = Math.min(Math.max(request.max_bytes ?? DEFAULT_MAX_BYTES, 2e3), MAX_MAX_BYTES);
    const includeValues = request.include_values ?? "state";
    const raw = await this.collect(request.page_id);
    const state = this.updateState(request.page_id, raw);
    const latest = state.latestObservationId ? state.snapshots.get(state.latestObservationId) : void 0;
    const observationId = `obs_${state.generation}_${randomUUID().slice(0, 8)}`;
    const refs = /* @__PURE__ */ new Map();
    const publicFields = raw.fields.map((field) => {
      const base = `field:${slug(field.scope || "page")}/${slug(field.label || `${fieldKind(field)}-${field.index}`)}`;
      const occurrence = (refs.get(base) ?? 0) + 1;
      refs.set(base, occurrence);
      const ref = occurrence === 1 ? base : `${base}~${occurrence}`;
      state.refToTarget.set(ref, { label: field.label, scope: field.scope });
      const value = publicValue(field, includeValues, request.target);
      const constraints = Object.values(field.constraints).some((item) => item !== null) ? field.constraints : void 0;
      return {
        ref,
        label: field.label,
        ...field.scope ? { scope: field.scope } : {},
        kind: fieldKind(field),
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
    let fields = publicFields;
    let overlays = raw.overlays.map((overlay) => ({ ...overlay, options: overlay.options.slice(0, 100) }));
    let sections = raw.sections;
    const rawValidations = raw.validations.map((item) => item.slice(0, 300));
    let validations = rawValidations;
    let locality;
    if (request.mode === "focus") {
      fields = publicFields.filter((field) => isRelevant(`${field.scope ?? ""} ${field.label}`, request.target, request.scope));
      overlays = overlays.filter((overlay) => !request.target || isRelevant(`${overlay.label} ${overlay.options.join(" ")}`, request.target));
      sections = sections.filter((section) => !request.scope || isRelevant(section, void 0, request.scope));
      if (latest) {
        const before = new Map(latest.fields.map((field) => [field.ref, field]));
        const now = new Map(publicFields.map((field) => [field.ref, field]));
        const changedOutside = publicFields.filter((field) => !sameJson(before.get(field.ref), field) && !isRelevant(`${field.scope ?? ""} ${field.label}`, request.target, request.scope));
        const removedOutside = latest.fields.filter((field) => !now.has(field.ref) && !isRelevant(`${field.scope ?? ""} ${field.label}`, request.target, request.scope));
        locality = {
          mode: "focused",
          changed_outside_scope: changedOutside.length,
          removed_outside_scope: removedOutside.length,
          outside_change_labels: changedOutside.slice(0, 12).map((field) => field.label),
          widen_recommended: changedOutside.length + removedOutside.length > 0
        };
      }
    }
    if (request.mode === "overview") {
      overlays = overlays.map((overlay) => ({ ...overlay, options: overlay.options.slice(0, 20) }));
      validations = validations.slice(0, 20);
    }
    const previous = request.since_observation_id ? state.snapshots.get(request.since_observation_id) : void 0;
    let changes;
    if (request.mode === "delta") {
      if (!previous) {
        return codedError("observation_not_found", "\u6307\u5B9A\u7684 observation \u5DF2\u8FC7\u671F\uFF0C\u8BF7\u6267\u884C\u4E00\u6B21 overview \u6216 focus \u89C2\u5BDF", {
          current_generation: state.generation
        });
      }
      const before = new Map(previous.fields.map((field) => [field.ref, field]));
      const now = new Map(publicFields.map((field) => [field.ref, field]));
      const allChanged = publicFields.filter((field) => !sameJson(before.get(field.ref), field));
      const allRemoved = previous.fields.filter((field) => !now.has(field.ref));
      const focused = Boolean(request.target || request.scope);
      const localChanged = focused ? allChanged.filter((field) => isRelevant(`${field.scope ?? ""} ${field.label}`, request.target, request.scope)) : allChanged;
      const localRemoved = focused ? allRemoved.filter((field) => isRelevant(`${field.scope ?? ""} ${field.label}`, request.target, request.scope)) : allRemoved;
      const outsideChanged = focused ? allChanged.filter((field) => !localChanged.includes(field)) : [];
      const outsideRemoved = focused ? allRemoved.filter((field) => !localRemoved.includes(field)) : [];
      changes = {
        fields: localChanged,
        removed_refs: localRemoved.map((field) => field.ref),
        overlays_changed: !sameJson(previous.overlays, raw.overlays),
        validations_changed: !sameJson(previous.validations, rawValidations)
      };
      if (focused) {
        locality = {
          mode: "focused",
          changed_outside_scope: outsideChanged.length,
          removed_outside_scope: outsideRemoved.length,
          outside_change_labels: outsideChanged.slice(0, 12).map((field) => field.label),
          widen_recommended: outsideChanged.length + outsideRemoved.length > 0
        };
      }
      fields = changes.fields;
      sections = [];
      overlays = changes.overlays_changed ? overlays : [];
      validations = changes.validations_changed ? validations : [];
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
      fields,
      overlays,
      validations,
      ...changes ? { changes } : {},
      ...locality ? { locality } : {},
      truncated: false,
      omitted_counts: { fields: 0, options: 0, sections: 0, validations: 0 },
      metrics: { response_bytes: 0, observed_fields: raw.fields.length, returned_fields: fields.length },
      ...request.include_test_ledger ? { test_ledger: this.ledger.get(request.page_id) ?? [] } : {}
    };
    this.fitBudget(snapshot, maxBytes);
    snapshot.metrics.response_bytes = Buffer.byteLength(JSON.stringify(snapshot), "utf8");
    snapshot.metrics.returned_fields = snapshot.fields.length;
    const cached = {
      observationId,
      structuralHash: structuralHash(raw),
      fields: publicFields,
      overlays: raw.overlays,
      validations: rawValidations
    };
    state.snapshots.set(observationId, cached);
    state.latestObservationId = observationId;
    while (state.snapshots.size > HISTORY_LIMIT) {
      const oldest = state.snapshots.keys().next().value;
      if (!oldest) break;
      state.snapshots.delete(oldest);
    }
    return contentResult(snapshot);
  }
  async fillFields(params) {
    const cached = this.operationResult(params.operationId);
    if (cached) return cached;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    const results = [];
    for (const field of params.fields) {
      try {
        const target = this.expandTarget(params.pageId, field.field, field.scope);
        const candidate = await this.resolve(params.pageId, { field: target.label, scope: target.scope, roles: ["input", "textarea", "select", "textbox", "combobox", "checkbox", "radio", "switch"] });
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
        await this.fillResolved(params.pageId, { field: target.label, scope: target.scope }, wanted);
        const after = await this.resolve(params.pageId, { field: target.label, scope: target.scope });
        results.push(this.valueMatches(after.meta, wanted) ? { field: field.field, status: "filled" } : { field: field.field, status: "postcondition_failed", state: this.safeCandidateState(after.meta) });
      } catch (error) {
        results.push({ field: field.field, status: errorCode(error), message: this.safeError(error) });
      }
    }
    const ok = results.every((result2) => result2.status === "filled" || result2.status === "unchanged" || result2.status === "preserved");
    const result = contentResult({ ok, operation_id: params.operationId ?? randomUUID(), results, change_summary: this.summarize(results) }, !ok);
    this.recordOperation(params, "form_fill_fields", `${params.fields.length} fields`, ok ? "completed" : "partial", result);
    return result;
  }
  async selectOption(params) {
    const cached = this.operationResult(params.operationId);
    if (cached) return cached;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    const target = this.expandTarget(params.pageId, params.field, params.scope);
    try {
      const trigger = await this.resolve(params.pageId, { field: target.label, scope: target.scope });
      if (trigger.meta.tag === "select") {
        await this.fillResolved(params.pageId, { field: target.label, scope: target.scope }, params.value);
      } else if (trigger.meta.type === "radio" || trigger.meta.type === "checkbox") {
        const option = await this.resolve(params.pageId, { field: params.value, scope: target.scope, roles: ["radio", "checkbox"] }).catch(() => trigger);
        if (!this.valueMatches(option.meta, true)) await this.clickResolved(params.pageId, { field: option.meta.label, scope: option.meta.scope }, true);
      } else {
        await this.clickResolved(params.pageId, { field: target.label, scope: target.scope }, true);
        if (params.query) await this.fillResolved(params.pageId, { field: target.label, scope: target.scope }, params.query);
        const option = await this.waitResolve(params.pageId, { field: target.label, scope: target.scope, option: params.value, roles: ["option", "treeitem", "menuitem", "li"] });
        await this.clickResolved(params.pageId, { field: option.meta.label, scope: option.meta.scope, option: params.value }, true);
      }
      await this.delay(30);
      const verified = await this.verifySelected(params.pageId, target, params.value);
      const data = {
        ok: verified,
        operation_id: params.operationId ?? randomUUID(),
        field: params.field,
        selected: params.value,
        field_state: verified ? "selected" : "unknown",
        overlay: await this.overlayState(params.pageId)
      };
      const result = contentResult(data, !verified);
      this.recordOperation(params, "form_select_option", params.field, verified ? "completed" : "unknown", result);
      return result;
    } catch (error) {
      const result = codedError(errorCode(error), this.safeError(error), { field: params.field, value: params.value });
      this.recordOperation(params, "form_select_option", params.field, "failed", result);
      return result;
    }
  }
  async selectPath(params) {
    const cached = this.operationResult(params.operationId);
    if (cached) return cached;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    const target = this.expandTarget(params.pageId, params.field, params.scope);
    const completed = [];
    try {
      await this.clickResolved(params.pageId, { field: target.label, scope: target.scope }, true);
      for (const segment of params.path) {
        const option = await this.waitResolve(params.pageId, { field: target.label, scope: target.scope, option: segment, roles: ["option", "treeitem", "menuitem", "li"] });
        await this.clickResolved(params.pageId, { field: option.meta.label, scope: option.meta.scope, option: segment }, true);
        completed.push(segment);
        await this.delay(35);
      }
      const verified = await this.verifySelected(params.pageId, target, params.path.at(-1) ?? "");
      const data = {
        ok: verified,
        operation_id: params.operationId ?? randomUUID(),
        field: params.field,
        requested_path: params.path,
        completed_path: completed,
        field_state: verified ? "selected" : "partial",
        overlay: await this.overlayState(params.pageId)
      };
      const result = contentResult(data, !verified);
      this.recordOperation(params, "form_select_path", params.field, verified ? "completed" : "partial", result);
      return result;
    } catch (error) {
      const result = codedError(errorCode(error), this.safeError(error), {
        field: params.field,
        requested_path: params.path,
        completed_path: completed,
        failed_level: completed.length
      });
      this.recordOperation(params, "form_select_path", params.field, "failed", result);
      return result;
    }
  }
  async setDate(params) {
    const cached = this.operationResult(params.operationId);
    if (cached) return cached;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    const target = this.expandTarget(params.pageId, params.field, params.scope);
    try {
      const before = await this.resolve(params.pageId, { field: target.label, scope: target.scope });
      if (!params.overwrite && before.meta.value && !this.valueMatches(before.meta, params.value)) {
        return contentResult({ ok: true, operation_id: params.operationId ?? randomUUID(), field: params.field, status: "preserved", value_state: "existing" });
      }
      const constraint = this.constraintError(before.meta, params.value);
      if (constraint) return codedError("constraint_violation", constraint, { field: params.field });
      await this.fillResolved(params.pageId, { field: target.label, scope: target.scope }, params.value);
      await this.delay(40);
      const after = await this.resolve(params.pageId, { field: target.label, scope: target.scope });
      const verified = this.valueMatches(after.meta, params.value);
      const data = {
        ok: verified,
        operation_id: params.operationId ?? randomUUID(),
        field: params.field,
        status: verified ? "filled" : "partial",
        value_state: verified ? "matched" : "mismatched"
      };
      const result = contentResult(data, !verified);
      this.recordOperation(params, "form_set_date", params.field, verified ? "completed" : "partial", result);
      return result;
    } catch (error) {
      const result = codedError(errorCode(error), this.safeError(error), { field: params.field, status: "partial" });
      this.recordOperation(params, "form_set_date", params.field, "failed", result);
      return result;
    }
  }
  async activate(params) {
    const cached = this.operationResult(params.operationId);
    if (cached) return cached;
    const conflict = this.checkGeneration(params.pageId, params.expectedGeneration);
    if (conflict) return conflict;
    if (manualBoundaryPattern.test(params.target)) return codedError("manual_boundary", "\u8BE5\u63A7\u4EF6\u5C5E\u4E8E\u6700\u7EC8\u63D0\u4EA4\u3001\u58F0\u660E\u3001\u4E0A\u4F20\u6216\u4E0D\u53EF\u9006\u8FB9\u754C\uFF0C\u5FC5\u987B\u7531\u7528\u6237\u64CD\u4F5C", { target: params.target });
    const target = this.expandTarget(params.pageId, params.target, params.scope);
    try {
      const before = await this.collect(params.pageId);
      if (params.intent === "focus") await this.focusResolved(params.pageId, { field: target.label, scope: target.scope });
      else await this.clickResolved(params.pageId, { field: target.label, scope: target.scope, roles: ["button"] }, params.intent === "open" || params.intent === "close");
      await this.delay(60);
      const after = await this.collect(params.pageId);
      const changed = structuralHash(before) !== structuralHash(after) || !sameJson(before.validations, after.validations);
      const accepted = params.intent === "focus" || changed || params.intent === "save_record";
      const data = {
        ok: accepted,
        operation_id: params.operationId ?? randomUUID(),
        target: params.target,
        intent: params.intent,
        result: accepted ? "completed" : "action_result_unknown",
        page_changed: before.url !== after.url,
        structure_changed: structuralHash(before) !== structuralHash(after),
        overlay: after.overlays.length ? "open" : "closed"
      };
      const result = contentResult(data, !accepted);
      this.recordOperation(params, "form_activate", params.target, accepted ? "completed" : "unknown", result);
      return result;
    } catch (error) {
      const result = codedError(errorCode(error), this.safeError(error), { target: params.target, intent: params.intent });
      this.recordOperation(params, "form_activate", params.target, "failed", result);
      return result;
    }
  }
  async collect(pageId) {
    const page = this.getPage(pageId);
    const frames = page.pptrPage.frames();
    const gathered = await Promise.all(frames.map(async (frame, frameIndex) => {
      try {
        const part = await frame.evaluate(collectDomForm);
        return {
          ...part,
          fields: part.fields.map((field) => ({ ...field, frame: frameIndex })),
          overlays: part.overlays.map((overlay) => ({ ...overlay, frame: frameIndex }))
        };
      } catch {
        return { fields: [], overlays: [], sections: [], validations: [] };
      }
    }));
    return {
      url: cleanText(page.pptrPage.url()),
      title: cleanText(await page.pptrPage.title()),
      fields: gathered.flatMap((part) => part.fields),
      overlays: gathered.flatMap((part) => part.overlays),
      sections: [...new Set(gathered.flatMap((part) => part.sections))],
      validations: [...new Set(gathered.flatMap((part) => part.validations))]
    };
  }
  updateState(pageId, raw) {
    const nav = navigationId(raw.url);
    const existing = this.states.get(pageId);
    if (!existing || existing.navigationId !== nav) {
      const created = { navigationId: nav, url: raw.url, generation: 1, snapshots: /* @__PURE__ */ new Map(), refToTarget: /* @__PURE__ */ new Map() };
      this.states.set(pageId, created);
      return created;
    }
    const latest = existing.latestObservationId ? existing.snapshots.get(existing.latestObservationId) : void 0;
    const currentHash = structuralHash(raw);
    if (latest && latest.structuralHash !== currentHash) existing.generation += 1;
    existing.url = raw.url;
    return existing;
  }
  fitBudget(snapshot, maxBytes) {
    const byteLength = () => Buffer.byteLength(JSON.stringify(snapshot), "utf8");
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
    return mapped ? { label: mapped.label, ...mapped.scope ? { scope: mapped.scope } : {} } : { label: field, ...scope ? { scope } : {} };
  }
  checkGeneration(pageId, expected) {
    if (expected === void 0) return null;
    const current = this.states.get(pageId)?.generation;
    return current !== void 0 && current !== expected ? codedError("generation_conflict", "\u9875\u9762\u7ED3\u6784\u5DF2\u7ECF\u53D8\u5316\uFF0C\u8BF7\u5148\u6267\u884C focus \u6216 delta \u89C2\u5BDF", { expected_generation: expected, current_generation: current }) : null;
  }
  async resolve(pageId, spec) {
    const page = this.getPage(pageId);
    const frames = page.pptrPage.frames();
    const candidates = [];
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
      const frame = frames[frameIndex];
      if (!frame) continue;
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
    if (runnerUp && runnerUp.meta.score === best.meta.score && normalize(runnerUp.meta.label) === normalize(best.meta.label)) {
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
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      const resolved = await this.resolve(pageId, spec);
      const handle = await this.elementHandle(resolved, spec);
      try {
        let locator = handle.asLocator();
        if (typeof locator.setTimeout === "function") locator = locator.setTimeout(ACTION_TIMEOUT);
        if (typeof locator.setWaitForStableBoundingBox === "function") locator = locator.setWaitForStableBoundingBox(false);
        await locator.fill(typeof value === "number" ? String(value) : value);
        return;
      } catch (error) {
        lastError = error;
      } finally {
        handle[Symbol.dispose]?.();
      }
      await this.delay(15);
    }
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
  async clickResolved(pageId, spec, allowAtomicFallback) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      const resolved = await this.resolve(pageId, spec);
      const handle = await this.elementHandle(resolved, spec);
      let started = false;
      let locator;
      const listener = () => {
        started = true;
      };
      try {
        locator = handle.asLocator();
        if (typeof locator.setTimeout === "function") locator = locator.setTimeout(ACTION_TIMEOUT);
        if (typeof locator.setWaitForStableBoundingBox === "function") locator = locator.setWaitForStableBoundingBox(false);
        locator.on?.("action", listener);
        await locator.click();
        return;
      } catch (error) {
        lastError = error;
        if (started) throw new Error("action_result_unknown: click started before the node changed", { cause: error });
      } finally {
        locator?.off?.("action", listener);
        handle[Symbol.dispose]?.();
      }
      await this.delay(15);
    }
    if (allowAtomicFallback) {
      const page = this.getPage(pageId);
      for (const frame of page.pptrPage.frames()) {
        try {
          const result = await frame.evaluate(atomicClick, spec);
          if (result.applied) return;
        } catch {
        }
      }
    }
    throw new Error(`postcondition_failed: unable to activate semantic target (${this.safeError(lastError)})`);
  }
  async focusResolved(pageId, spec) {
    const resolved = await this.resolve(pageId, spec);
    const handle = await this.elementHandle(resolved, spec);
    try {
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
      } catch (error) {
        lastError = error;
        await this.delay(50);
      }
    }
    throw lastError ?? new Error(`option_not_found: ${spec.option ?? spec.field}`);
  }
  valueMatches(candidate, wanted) {
    if (candidate.checked !== null) return candidate.checked === Boolean(wanted);
    const actual = normalize(candidate.value);
    const expected = normalize(wanted);
    return actual === expected || actual.includes(expected) || expected.includes(actual) && actual.length > 1;
  }
  hasExistingValue(candidate) {
    if (candidate.checked !== null) return false;
    const value = normalize(candidate.value);
    if (!value) return false;
    return !/^(请选择|选择|未选择|请选择一项|pleasechoose|select)$/.test(value);
  }
  constraintError(candidate, value) {
    if (typeof value === "boolean") return null;
    const text = String(value);
    if (candidate.disabled) return "target is disabled";
    if (candidate.readonly) return "target is readonly";
    if (candidate.constraints.maxlength !== null && text.length > candidate.constraints.maxlength) return `value exceeds maxlength ${candidate.constraints.maxlength}`;
    if (candidate.constraints.minlength !== null && text.length < candidate.constraints.minlength) return `value is shorter than minlength ${candidate.constraints.minlength}`;
    if (candidate.constraints.pattern) {
      try {
        if (!new RegExp(`^(?:${candidate.constraints.pattern})$`).test(text)) return `value does not match pattern ${candidate.constraints.pattern}`;
      } catch {
      }
    }
    if (candidate.constraints.min && text < candidate.constraints.min) return `value is below min ${candidate.constraints.min}`;
    if (candidate.constraints.max && text > candidate.constraints.max) return `value is above max ${candidate.constraints.max}`;
    return null;
  }
  async verifySelected(pageId, target, value) {
    try {
      const field = await this.resolve(pageId, { field: target.label, scope: target.scope });
      if (normalize(field.meta.value).includes(normalize(value))) return true;
      const selected = await this.resolve(pageId, { field: value, scope: target.scope, roles: ["option", "radio", "checkbox", "treeitem"] });
      return selected.meta.checked === true || normalize(selected.meta.value).includes(normalize(value));
    } catch {
      try {
        const raw = await this.collect(pageId);
        const wanted = normalize(value);
        const wantedScope = normalize(target.scope);
        return raw.fields.some((field) => {
          const sameScope = !wantedScope || normalize(field.scope).includes(wantedScope) || wantedScope.includes(normalize(field.scope));
          return sameScope && (normalize(field.label).includes(wanted) || normalize(field.value).includes(wanted) || field.options.some((option) => normalize(option) === wanted && field.value.includes(option)));
        });
      } catch {
        return false;
      }
    }
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
      const key = String(result.status ?? "unknown");
      summary[key] = (summary[key] ?? 0) + 1;
    }
    return summary;
  }
  operationResult(operationId) {
    return operationId ? this.completedOperations.get(operationId) ?? null : null;
  }
  recordOperation(context, action, target, resultName, result) {
    if (context.operationId) this.completedOperations.set(context.operationId, result);
    if (!context.testMode) return;
    const entries = this.ledger.get(context.pageId) ?? [];
    entries.push({
      operation_id: context.operationId ?? randomUUID(),
      action,
      target,
      result: resultName,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    this.ledger.set(context.pageId, entries.slice(-100));
  }
  safeError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/(cookie|authorization|set-cookie)\s*[:=]\s*[^\s,;]+/gi, "$1=<redacted>").slice(0, 400);
  }
  delay(milliseconds) {
    return new Promise((resolve3) => setTimeout(resolve3, milliseconds));
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
  for (const key of comparableKeys) {
    const left = normalized(expected.node[key]);
    const right = normalized(candidate.node[key]);
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
function isDetachedUidError(error) {
  return error instanceof Error && error.message.includes("no longer exists on the page");
}
function isDetachedHandleError(error) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("detached") || message.includes("no longer exists") || message.includes("could not find object with given id") || message.includes("js handle is disposed");
}
async function handleConnectionState(handle) {
  const debuggable = handle;
  if (!debuggable.evaluate) return "connected";
  try {
    return await debuggable.evaluate((element) => element.isConnected) ? "connected" : "detached";
  } catch (error) {
    return isDetachedHandleError(error) ? "detached" : "unknown";
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
  for (const transform of transforms) {
    const method = locator[transform.method];
    if (typeof method !== "function") {
      throw new Error(`stale_action_incompatible: Locator method ${transform.method} is unavailable`);
    }
    locator = Reflect.apply(method, locator, transform.args);
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
  const listener = () => {
    started = true;
  };
  locator.on?.("action", listener);
  return {
    didStart: () => started,
    stop: () => {
      locator.off?.("action", listener);
    }
  };
}
async function replaceCurrentHandle(state) {
  const recovered = await recoverHandle(state.page, state.uid, state.expected);
  state.current = recovered;
  state.handles.add(recovered);
  return recovered;
}
async function runLocatorAction(state, transforms, action, args) {
  const attemptedHandle = state.current;
  const initialLocator = locatorFrom(attemptedHandle, transforms);
  const initialMethod = initialLocator[action];
  if (typeof initialMethod !== "function") throw new Error(`stale_action_incompatible: Locator action ${action} is unavailable`);
  const observation = observeLocatorAction(initialLocator);
  try {
    return await Reflect.apply(initialMethod, initialLocator, args);
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
    const recovered = await replaceCurrentHandle(state);
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
          } catch (error) {
            if (state.readRecoveryUsed || await handleConnectionState(attemptedHandle) !== "detached") throw error;
            state.readRecoveryUsed = true;
            const recovered = await replaceCurrentHandle(state);
            const recoveredEvaluate = recovered.evaluate;
            if (!recoveredEvaluate) throw error;
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
    } catch (error) {
      if (!expected || !isDetachedUidError(error)) throw error;
      return resilientHandle(this, uid, expected, await recoverHandle(this, uid, expected));
    }
  };
  prototype[installedSymbol] = true;
}

// src/chrome-profile.ts
import { createHash as createHash2, randomUUID as randomUUID2 } from "node:crypto";
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
function profileHash(profileDir2) {
  return createHash2("sha256").update(profileDir2).digest("hex").slice(0, 12);
}
function processExists(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "EPERM";
  }
}
async function chromeProfileIsBusy(profileDir2) {
  const singletonLock = join(profileDir2, "SingletonLock");
  try {
    const metadata = await lstat(singletonLock);
    if (!metadata.isSymbolicLink()) return true;
    const target = await readlink(singletonLock);
    const pid = /-(\d+)$/.exec(target)?.[1];
    return pid ? processExists(Number(pid)) : true;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
    if (code === "ENOENT") return false;
    return true;
  }
}
var ChromeProfileLock = class {
  lockPath;
  profileDir;
  token = randomUUID2();
  held = false;
  constructor(profileDir2) {
    this.profileDir = profileDir2;
    this.lockPath = join(dirname(profileDir2), "chrome-mcp.lock");
  }
  async acquire() {
    await mkdir(this.profileDir, { recursive: true, mode: 448 });
    await mkdir(dirname(this.lockPath), { recursive: true, mode: 448 });
    const record = {
      format: "resume-companion-chrome-lock",
      pid: process.pid,
      token: this.token,
      started_at: (/* @__PURE__ */ new Date()).toISOString(),
      profile_hash: profileHash(this.profileDir)
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const handle = await open(this.lockPath, "wx", 384);
        await handle.writeFile(`${JSON.stringify(record)}
`, "utf8");
        await handle.sync();
        await handle.close();
        this.held = true;
        if (await chromeProfileIsBusy(this.profileDir)) {
          await this.release();
          throw new Error("profile_in_use: \u4E13\u7528 Chrome Profile \u6B63\u7531\u6B8B\u7559\u6216\u5916\u90E8 Chrome \u8FDB\u7A0B\u4F7F\u7528\uFF1B\u8BF7\u5148\u5173\u95ED\u5BF9\u5E94 Chrome \u7A97\u53E3");
        }
        return;
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
        if (code !== "EEXIST") throw error;
        const existing = await this.readExisting();
        if (!existing || processExists(existing.pid)) {
          throw new Error("profile_in_use: Resume Companion \u4E13\u7528 Chrome \u6B63\u7531\u53E6\u4E00\u4E2A\u4EFB\u52A1\u4F7F\u7528\uFF1B\u8BF7\u5173\u95ED\u90A3\u4E2A\u4EFB\u52A1\u540E\u91CD\u8BD5");
        }
        if (await chromeProfileIsBusy(this.profileDir)) {
          throw new Error("profile_in_use: \u4E0A\u4E00\u4E2A MCP \u8FDB\u7A0B\u5DF2\u9000\u51FA\uFF0C\u4F46\u4E13\u7528 Chrome \u4ECD\u5728\u4F7F\u7528 Profile\uFF1B\u8BF7\u5148\u5173\u95ED\u8BE5 Chrome \u7A97\u53E3");
        }
        await unlink(this.lockPath).catch(() => void 0);
      }
    }
    throw new Error("profile_in_use: \u65E0\u6CD5\u5B89\u5168\u53D6\u5F97 Resume Companion \u4E13\u7528 Chrome \u7684\u5B9E\u4F8B\u9501");
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
var moduleDirectory = dirname2(fileURLToPath(import.meta.url));
var runtimeEntry = process.env.RESUME_COMPANION_DEVTOOLS_RUNTIME ?? [
  resolve2(moduleDirectory, "runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js"),
  resolve2(moduleDirectory, "../runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js"),
  resolve2(moduleDirectory, "../../node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js")
].find(existsSync) ?? resolve2(moduleDirectory, "runtime/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js");
var runtimeSource = resolve2(dirname2(runtimeEntry), "..");
function runtimeModule(path) {
  return pathToFileURL(resolve2(runtimeSource, path)).href;
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
var ResumeBrowserServer = class _ResumeBrowserServer {
  server;
  mutex;
  browser;
  context;
  engine;
  lockHeld = false;
  closing = false;
  constructor() {
    this.server = new thirdPartyModule.McpServer({
      name: "resume_browser",
      title: "Resume Browser MCP",
      version: "0.15.0"
    }, { capabilities: { logging: {} } });
    this.mutex = new thirdPartyModule.Mutex();
  }
  static async create() {
    const instance = new _ResumeBrowserServer();
    instance.registerUpstreamTools();
    instance.registerFormTools();
    return instance;
  }
  async connect() {
    const transport = new thirdPartyModule.StdioServerTransport();
    await this.server.connect(transport);
    console.error(`Resume Browser MCP 0.15.0 ready; Chrome profile ${profileHash(profileDir)} is acquired on first browser call.`);
  }
  async close() {
    if (this.closing) return;
    this.closing = true;
    this.engine?.clear();
    this.context?.dispose?.();
    this.context = void 0;
    this.engine = void 0;
    try {
      await browserModule.closeBrowser();
    } finally {
      if (this.lockHeld) await lock.release();
      this.lockHeld = false;
      await this.server.close().catch(() => void 0);
    }
  }
  registerUpstreamTools() {
    const blocked = /* @__PURE__ */ new Set(["upload_file", "lighthouse_audit"]);
    for (const tool of toolsModule.createTools(upstreamArgs)) {
      if (blocked.has(tool.name)) continue;
      const handler = new toolHandlerModule.ToolHandler(tool, upstreamArgs, () => this.getContext(), this.mutex);
      if (!handler.shouldRegister) continue;
      this.server.registerTool(tool.name, {
        description: tool.description,
        inputSchema: handler.registeredInputSchema,
        annotations: tool.annotations
      }, async (params) => await handler.handle(params));
    }
  }
  registerFormTools() {
    this.server.registerTool("form_observe", {
      description: "Observe a recruitment form with local semantic caching. Focused results expose local details and only a value-free sentinel for changes elsewhere; full mode is explicit.",
      inputSchema: {
        page_id: external_exports.number().int().positive(),
        mode: external_exports.enum(["overview", "focus", "delta", "full"]).default("overview"),
        target: external_exports.string().max(200).optional(),
        scope: external_exports.string().max(200).optional(),
        since_observation_id: external_exports.string().max(120).optional(),
        max_bytes: external_exports.number().int().min(2e3).max(8e4).optional(),
        include_values: external_exports.enum(["state", "masked", "needed"]).optional(),
        include_test_ledger: external_exports.boolean().optional()
      },
      annotations: { readOnlyHint: true }
    }, async (params) => await this.handleForm(params.page_id, (engine) => engine.observe(params)));
    this.server.registerTool("form_fill_fields", {
      description: "Fill a dependency-safe batch of ordinary fields by semantic label or logical field reference, then verify each value locally.",
      inputSchema: {
        ...operationFields,
        fields: external_exports.array(external_exports.object({
          field: external_exports.string().min(1).max(240),
          scope: external_exports.string().max(240).optional(),
          value: external_exports.union([external_exports.string().max(2e4), external_exports.boolean(), external_exports.number()]),
          overwrite: external_exports.boolean().optional()
        })).min(1).max(80)
      },
      annotations: { readOnlyHint: false }
    }, async (params) => await this.handleForm(params.page_id, (engine) => engine.fillFields({
      pageId: params.page_id,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      fields: params.fields
    })));
    this.server.registerTool("form_select_option", {
      description: "Select one radio, checkbox, native option or custom dropdown candidate and verify the resulting field state.",
      inputSchema: {
        ...operationFields,
        field: external_exports.string().min(1).max(240),
        value: external_exports.string().min(1).max(500),
        scope: external_exports.string().max(240).optional(),
        query: external_exports.string().max(500).optional()
      },
      annotations: { readOnlyHint: false }
    }, async (params) => await this.handleForm(params.page_id, (engine) => engine.selectOption({
      pageId: params.page_id,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      field: params.field,
      value: params.value,
      scope: params.scope,
      query: params.query
    })));
    this.server.registerTool("form_select_path", {
      description: "Complete a cascader or tree path inside one MCP transaction without returning intermediate full-page snapshots.",
      inputSchema: {
        ...operationFields,
        field: external_exports.string().min(1).max(240),
        path: external_exports.array(external_exports.string().min(1).max(500)).min(1).max(12),
        scope: external_exports.string().max(240).optional()
      },
      annotations: { readOnlyHint: false }
    }, async (params) => await this.handleForm(params.page_id, (engine) => engine.selectPath({
      pageId: params.page_id,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      field: params.field,
      path: params.path,
      scope: params.scope
    })));
    this.server.registerTool("form_set_date", {
      description: "Set and verify one complete date or month value as a transaction; intermediate picker values are never reported as success.",
      inputSchema: {
        ...operationFields,
        field: external_exports.string().min(1).max(240),
        value: external_exports.string().min(4).max(80),
        scope: external_exports.string().max(240).optional(),
        overwrite: external_exports.boolean().optional()
      },
      annotations: { readOnlyHint: false }
    }, async (params) => await this.handleForm(params.page_id, (engine) => engine.setDate({
      pageId: params.page_id,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      field: params.field,
      value: params.value,
      scope: params.scope,
      overwrite: params.overwrite
    })));
    this.server.registerTool("form_activate", {
      description: "Focus, open, close, add, save, or enter an ordinary next step by semantic target. Final submission and manual boundaries are blocked.",
      inputSchema: {
        ...operationFields,
        target: external_exports.string().min(1).max(240),
        scope: external_exports.string().max(240).optional(),
        intent: external_exports.enum(["focus", "open", "close", "add_record", "save_record", "next_step"])
      },
      annotations: { readOnlyHint: false }
    }, async (params) => await this.handleForm(params.page_id, (engine) => engine.activate({
      pageId: params.page_id,
      expectedGeneration: params.expected_generation,
      operationId: params.operation_id,
      testMode: params.test_mode,
      target: params.target,
      scope: params.scope,
      intent: params.intent
    })));
  }
  async handleForm(pageId, callback) {
    const guard = await this.mutex.acquire();
    try {
      const context = await this.getContext();
      context.getPageById(pageId);
      if (!this.engine) this.engine = new FormEngine((id) => context.getPageById(id));
      return await callback(this.engine);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: { code: "browser_error", message: redactDiagnostic(message) } }, null, 2) }],
        structuredContent: { ok: false, error: { code: "browser_error", message: redactDiagnostic(message) } },
        isError: true
      };
    } finally {
      guard[Symbol.dispose]();
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
      this.engine = new FormEngine((id) => context.getPageById(id));
    }
    if (!this.context) throw new Error("browser_context_unavailable");
    return this.context;
  }
};
function redactDiagnostic(value) {
  return value.replaceAll(profileDir, `<chrome-profile:${profileHash(profileDir)}>`).replace(/\b(authorization|cookie|set-cookie)\s*[:=]\s*[^\s,;]+/gi, "$1=<redacted>").replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/g, "$1?<redacted>").slice(0, 1e3);
}
async function runResumeBrowserServer() {
  const server = await ResumeBrowserServer.create();
  let shutdownPromise;
  const requestShutdown = () => {
    shutdownPromise ??= server.close().finally(() => process.exit(0));
  };
  process.stdin.once("end", requestShutdown);
  process.stdin.once("close", requestShutdown);
  process.once("SIGTERM", requestShutdown);
  process.once("SIGINT", requestShutdown);
  await server.connect();
}

// src/chrome-launcher.ts
await runResumeBrowserServer();
