import { FormEngine } from '../extension/src/content/engine';
import { demoProfile } from '../extension/src/domain/profile';
import { sources, suggestSource, proposedValue } from '../extension/src/domain/rules';

Object.assign(window, { ResumeTest: { FormEngine, demoProfile, sources, suggestSource, proposedValue } });
