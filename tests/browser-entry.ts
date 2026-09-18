import { AutomationEngine } from '../extension/src/content/automation/engine';
import { FormEngine } from '../extension/src/content/engine';
import { demoProfile } from '../extension/src/domain/profile';
import { sources, suggestSource, proposedValue } from '../extension/src/domain/rules';
import {inspectForm} from '../extension/src/content/diagnostics';
import {openBankcommSection} from '../extension/src/content/bankcomm-actions';

Object.assign(window, { ResumeTest: { AutomationEngine, FormEngine, demoProfile, sources, suggestSource, proposedValue,inspectForm,openBankcommSection } });
