/**
 * RAW DEBUG - Shows exact structure QuickNode sends
 * Copy this to QuickNode filter to see what we're receiving
 */
function main(block) {
  // Return the raw structure so we can see what QuickNode sends
  return {
    receivedKeys: Object.keys(block || {}),
    hasTransactions: !!(block && block.transactions),
    transactionCount: block?.transactions?.length || 0,
    hasSlot: "slot" in (block || {}),
    hasParentSlot: "parentSlot" in (block || {}),
    slot: block?.slot,
    parentSlot: block?.parentSlot,
    blockHeight: block?.blockHeight,
    // Sample first tx structure if exists
    firstTxKeys: block?.transactions?.[0] ? Object.keys(block.transactions[0]) : null,
  };
}
