"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProgressTracker = exports.QUERY_STEPS = void 0;
exports.createSpinner = createSpinner;
exports.createQueryProgress = createQueryProgress;
/**
 * Progress display utilities using ora spinners
 */
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
/**
 * Create a spinner for a step
 */
function createSpinner(text) {
    return (0, ora_1.default)({
        text,
        color: "cyan",
    });
}
/**
 * Query workflow steps
 */
exports.QUERY_STEPS = [
    "Initializing TEE session",
    "Fetching pools",
    "Encrypting predicate",
    "Submitting query to L1",
    "Delegating to TEE",
    "Executing and decrypting results",
];
/**
 * Progress tracker for multi-step workflows
 */
class ProgressTracker {
    constructor(steps, silent = false) {
        this.currentStep = 0;
        this.spinner = null;
        this.steps = steps;
        this.totalSteps = steps.length;
        this.silent = silent;
    }
    /**
     * Start the next step
     */
    start(customText) {
        if (this.silent)
            return;
        const stepNum = this.currentStep + 1;
        const stepText = customText || this.steps[this.currentStep];
        const text = chalk_1.default.gray(`[${stepNum}/${this.totalSteps}]`) + ` ${stepText}...`;
        this.spinner = createSpinner(text);
        this.spinner.start();
    }
    /**
     * Mark current step as successful and move to next
     */
    succeed(text) {
        if (this.silent)
            return;
        if (this.spinner) {
            this.spinner.succeed(text);
        }
        this.currentStep++;
    }
    /**
     * Mark current step as failed
     */
    fail(text) {
        if (this.silent)
            return;
        if (this.spinner) {
            this.spinner.fail(text);
        }
    }
    /**
     * Update the spinner text
     */
    update(text) {
        if (this.silent)
            return;
        if (this.spinner) {
            this.spinner.text = text;
        }
    }
    /**
     * Show a warning for current step
     */
    warn(text) {
        if (this.silent)
            return;
        if (this.spinner) {
            this.spinner.warn(text);
        }
    }
    /**
     * Stop spinner without status
     */
    stop() {
        if (this.spinner) {
            this.spinner.stop();
        }
    }
    /**
     * Get current step number (1-indexed)
     */
    getCurrentStep() {
        return this.currentStep + 1;
    }
    /**
     * Check if all steps are complete
     */
    isComplete() {
        return this.currentStep >= this.totalSteps;
    }
}
exports.ProgressTracker = ProgressTracker;
/**
 * Create a progress tracker for query workflow
 */
function createQueryProgress(silent = false) {
    return new ProgressTracker(exports.QUERY_STEPS, silent);
}
