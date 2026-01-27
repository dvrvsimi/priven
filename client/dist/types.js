"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryStatus = exports.FILTER_SIZE = exports.MAX_FILTERS = exports.ENCRYPTED_PREDICATE_SIZE = exports.ENCRYPTED_PREDICATE_SIZE_V1 = exports.FilterOp = exports.FilterType = void 0;
exports.isPredicateV2 = isPredicateV2;
exports.isPredicateV1 = isPredicateV1;
// ============================================================================
// PREDICATE V2 TYPES (Flexible Filters)
// ============================================================================
/**
 * Filter types for predicate evaluation (matches Rust FilterType enum)
 */
var FilterType;
(function (FilterType) {
    FilterType[FilterType["TVL"] = 0] = "TVL";
    FilterType[FilterType["BALANCE"] = 1] = "BALANCE";
    FilterType[FilterType["VOLUME_24H"] = 2] = "VOLUME_24H";
    FilterType[FilterType["FEE_RATE"] = 3] = "FEE_RATE";
    FilterType[FilterType["PRICE"] = 4] = "PRICE";
    FilterType[FilterType["APY"] = 5] = "APY";
    FilterType[FilterType["RESERVE_A"] = 6] = "RESERVE_A";
    FilterType[FilterType["RESERVE_B"] = 7] = "RESERVE_B";
    FilterType[FilterType["RATIO"] = 8] = "RATIO";
    FilterType[FilterType["MINT"] = 9] = "MINT";
    FilterType[FilterType["PROGRAM"] = 10] = "PROGRAM";
    FilterType[FilterType["SLOT_AGE"] = 11] = "SLOT_AGE";
})(FilterType || (exports.FilterType = FilterType = {}));
/**
 * Filter comparison operations (matches Rust FilterOp enum)
 */
var FilterOp;
(function (FilterOp) {
    FilterOp[FilterOp["GTE"] = 0] = "GTE";
    FilterOp[FilterOp["LTE"] = 1] = "LTE";
    FilterOp[FilterOp["EQ"] = 2] = "EQ";
    FilterOp[FilterOp["NEQ"] = 3] = "NEQ";
})(FilterOp || (exports.FilterOp = FilterOp = {}));
/**
 * Type guard to check if predicate is V2
 */
function isPredicateV2(predicate) {
    return "version" in predicate && predicate.version === 2;
}
/**
 * Type guard to check if predicate is V1 (legacy)
 */
function isPredicateV1(predicate) {
    return "minTvl" in predicate && "maxTvl" in predicate && !("version" in predicate);
}
/** Encrypted predicate size for V1 (legacy): 16 bytes plaintext + 12 nonce + 16 tag = 44 bytes */
exports.ENCRYPTED_PREDICATE_SIZE_V1 = 44;
/** Encrypted predicate size for V2: 46 bytes plaintext + padding + 12 nonce + 16 tag = 80 bytes */
exports.ENCRYPTED_PREDICATE_SIZE = 80;
/** Maximum filters in V2 predicate */
exports.MAX_FILTERS = 4;
/** Size of each filter when serialized */
exports.FILTER_SIZE = 11;
/**
 * Query state status values
 */
var QueryStatus;
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
})(QueryStatus || (exports.QueryStatus = QueryStatus = {}));
