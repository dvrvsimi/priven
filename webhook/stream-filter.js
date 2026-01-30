/**
 * QuickNode Streams Filter for Priven
 *
 * QuickNode sends: { data: [block1, block2, ...], metadata: {...} }
 */
function main(payload) {
  const PRIVEN_PROGRAM = "EMqLDAtqv5QPpBDk4fQtFDps7cXeWp1goNbra8fNWXaM";
  const DELEGATION_PROGRAM = "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";

  const INSTRUCTION_MAP = {
    SubmitQuery: "query_submitted",
    DelegateQuery: "query_delegated",
    ExecuteQuery: "query_executed",
    ExecuteQueryStateless: "query_executed",
    CommitResult: "result_committed",
    CommitAndWriteResult: "result_committed",  // Magic Actions
    WriteResultAction: "result_written",       // Magic Actions L1
    ExpireQuery: "query_expired",
  };

  const events = [];
  const blocks = payload.data || [];

  for (const block of blocks) {
    for (const tx of block.transactions || []) {
      if (tx.meta?.err) continue;

      const accounts = tx.transaction?.message?.accountKeys || [];
      const logs = tx.meta?.logMessages || [];

      const pubkeys = accounts.map(a => typeof a === "string" ? a : a.pubkey);

      const involvesPriven = pubkeys.some(
        pk => pk === PRIVEN_PROGRAM || pk === DELEGATION_PROGRAM
      );

      if (!involvesPriven) continue;

      let eventType = null;
      for (const log of logs) {
        const match = log.match(/Instruction: (\w+)/);
        if (match && INSTRUCTION_MAP[match[1]]) {
          eventType = INSTRUCTION_MAP[match[1]];
          break;
        }
      }

      if (!eventType) continue;

      events.push({
        type: eventType,
        signature: tx.transaction?.signatures?.[0],
        slot: block.parentSlot ? block.parentSlot + 1 : block.slot,
        blockTime: block.blockTime,
        accounts: pubkeys.slice(0, 5),
        fee: tx.meta?.fee,
      });
    }
  }

  if (events.length === 0) return null;

  return { data: events };
}
