/**
 * Progress display utilities using ora spinners
 */
import ora, { Ora } from "ora";
import chalk from "chalk";

/**
 * Create a spinner for a step
 */
export function createSpinner(text: string): Ora {
  return ora({
    text,
    color: "cyan",
  });
}

/**
 * Query workflow steps
 */
export const QUERY_STEPS = [
  "Initializing TEE session",
  "Fetching pools",
  "Encrypting predicate",
  "Submitting query to L1",
  "Delegating to TEE",
  "Executing and decrypting results",
] as const;

/**
 * Progress tracker for multi-step workflows
 */
export class ProgressTracker {
  private currentStep = 0;
  private totalSteps: number;
  private steps: readonly string[];
  private spinner: Ora | null = null;
  private silent: boolean;

  constructor(steps: readonly string[], silent = false) {
    this.steps = steps;
    this.totalSteps = steps.length;
    this.silent = silent;
  }

  /**
   * Start the next step
   */
  start(customText?: string): void {
    if (this.silent) return;

    const stepNum = this.currentStep + 1;
    const stepText = customText || this.steps[this.currentStep];
    const text = chalk.gray(`[${stepNum}/${this.totalSteps}]`) + ` ${stepText}...`;

    this.spinner = createSpinner(text);
    this.spinner.start();
  }

  /**
   * Mark current step as successful and move to next
   */
  succeed(text?: string): void {
    if (this.silent) return;

    if (this.spinner) {
      this.spinner.succeed(text);
    }
    this.currentStep++;
  }

  /**
   * Mark current step as failed
   */
  fail(text?: string): void {
    if (this.silent) return;

    if (this.spinner) {
      this.spinner.fail(text);
    }
  }

  /**
   * Update the spinner text
   */
  update(text: string): void {
    if (this.silent) return;

    if (this.spinner) {
      this.spinner.text = text;
    }
  }

  /**
   * Show a warning for current step
   */
  warn(text: string): void {
    if (this.silent) return;

    if (this.spinner) {
      this.spinner.warn(text);
    }
  }

  /**
   * Stop spinner without status
   */
  stop(): void {
    if (this.spinner) {
      this.spinner.stop();
    }
  }

  /**
   * Get current step number (1-indexed)
   */
  getCurrentStep(): number {
    return this.currentStep + 1;
  }

  /**
   * Check if all steps are complete
   */
  isComplete(): boolean {
    return this.currentStep >= this.totalSteps;
  }
}

/**
 * Create a progress tracker for query workflow
 */
export function createQueryProgress(silent = false): ProgressTracker {
  return new ProgressTracker(QUERY_STEPS, silent);
}
