"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TransactionStatus = exports.SignatureStatus = void 0;
//#region Specific Event Types
let SignatureStatus = exports.SignatureStatus = /*#__PURE__*/function (SignatureStatus) {
  SignatureStatus["REQUESTED"] = "requested";
  SignatureStatus["REJECTED"] = "rejected";
  SignatureStatus["CONFIRMED"] = "confirmed";
  return SignatureStatus;
}({});
let TransactionStatus = exports.TransactionStatus = /*#__PURE__*/function (TransactionStatus) {
  TransactionStatus["STARTED"] = "started";
  TransactionStatus["REJECTED"] = "rejected";
  TransactionStatus["BROADCASTED"] = "broadcasted";
  TransactionStatus["CONFIRMED"] = "confirmed";
  TransactionStatus["REVERTED"] = "reverted";
  return TransactionStatus;
}({});
//# sourceMappingURL=events.js.map