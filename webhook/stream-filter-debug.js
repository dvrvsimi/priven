/**
 * DEBUG VERSION - Returns ALL Priven-related transactions
 * Use this to verify the filter finds your transactions
 */
function main(block) {
  const PRIVEN_PROGRAM = "EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM";
  const DELEGATION_PROGRAM = "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";

  const found = [];

  for (const tx of block.transactions || []) {
    if (tx.meta?.err) continue;

    const accounts = tx.transaction?.message?.accountKeys || [];
    const logs = tx.meta?.logMessages || [];

    // Check all pubkeys
    const pubkeys = accounts.map(a => typeof a === "string" ? a : a.pubkey);

    // Check if Priven or Delegation is in ANY account
    const hasPriven = pubkeys.includes(PRIVEN_PROGRAM);
    const hasDelegation = pubkeys.includes(DELEGATION_PROGRAM);

    if (hasPriven || hasDelegation) {
      found.push({
        signature: tx.transaction?.signatures?.[0],
        hasPriven,
        hasDelegation,
        logSnippet: logs.slice(0, 5),
      });
    }
  }

  if (found.length === 0) {
    // Return debug info even if no match
    return {
      debug: true,
      totalTx: (block.transactions || []).length,
      slot: block.parentSlot + 1,
      message: "No Priven transactions in this block",
    };
  }

  return { found, slot: block.parentSlot + 1 };
}
