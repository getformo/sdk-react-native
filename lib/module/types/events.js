//#region Specific Event Types

export let SignatureStatus = /*#__PURE__*/function (SignatureStatus) {
  SignatureStatus["REQUESTED"] = "requested";
  SignatureStatus["REJECTED"] = "rejected";
  SignatureStatus["CONFIRMED"] = "confirmed";
  return SignatureStatus;
}({});
export let TransactionStatus = /*#__PURE__*/function (TransactionStatus) {
  TransactionStatus["STARTED"] = "started";
  TransactionStatus["REJECTED"] = "rejected";
  TransactionStatus["BROADCASTED"] = "broadcasted";
  TransactionStatus["CONFIRMED"] = "confirmed";
  TransactionStatus["REVERTED"] = "reverted";
  return TransactionStatus;
}({});
//# sourceMappingURL=events.js.map