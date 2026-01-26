/**
 * Query state status values
 */
export var QueryStatus;
(function (QueryStatus) {
    /** Query created, not yet delegated */
    QueryStatus[QueryStatus["Pending"] = 0] = "Pending";
    /** Delegated to TEE, waiting for execution */
    QueryStatus[QueryStatus["Delegated"] = 1] = "Delegated";
    /** TEE is processing */
    QueryStatus[QueryStatus["Executing"] = 2] = "Executing";
    /** Result committed to L1 */
    QueryStatus[QueryStatus["Completed"] = 3] = "Completed";
    /** Execution failed */
    QueryStatus[QueryStatus["Failed"] = 4] = "Failed";
})(QueryStatus || (QueryStatus = {}));
