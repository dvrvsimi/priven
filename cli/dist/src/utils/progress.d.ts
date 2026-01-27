/**
 * Progress display utilities using ora spinners
 */
import { Ora } from "ora";
/**
 * Create a spinner for a step
 */
export declare function createSpinner(text: string): Ora;
/**
 * Query workflow steps
 */
export declare const QUERY_STEPS: readonly ["Initializing TEE session", "Fetching pools", "Encrypting predicate", "Submitting query to L1", "Delegating to TEE", "Executing and decrypting results"];
/**
 * Progress tracker for multi-step workflows
 */
export declare class ProgressTracker {
    private currentStep;
    private totalSteps;
    private steps;
    private spinner;
    private silent;
    constructor(steps: readonly string[], silent?: boolean);
    /**
     * Start the next step
     */
    start(customText?: string): void;
    /**
     * Mark current step as successful and move to next
     */
    succeed(text?: string): void;
    /**
     * Mark current step as failed
     */
    fail(text?: string): void;
    /**
     * Update the spinner text
     */
    update(text: string): void;
    /**
     * Show a warning for current step
     */
    warn(text: string): void;
    /**
     * Stop spinner without status
     */
    stop(): void;
    /**
     * Get current step number (1-indexed)
     */
    getCurrentStep(): number;
    /**
     * Check if all steps are complete
     */
    isComplete(): boolean;
}
/**
 * Create a progress tracker for query workflow
 */
export declare function createQueryProgress(silent?: boolean): ProgressTracker;
