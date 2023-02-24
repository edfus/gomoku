import crypto from "crypto";
function uuidv4 () {
  return crypto.randomUUID();
}
export { uuidv4 }