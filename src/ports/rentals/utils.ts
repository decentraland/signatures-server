/**
 * Gets the last byte as a number from the a signature.
 * @param signature - A ECDSA signature.
 * @returns the last byte of the given signature.
 */
function getLastECDSASignatureByte(signature: string) {
  return Number.parseInt(signature.slice(-2), 16)
}

/**
 * Checks wether a ECDSA signature has a valid V.
 * @param signature - A ECDSA signature.
 * @throws "Invalid signature length" if the given signature has less than 65 bytes.
 * @returns true if the v value is decimal 27 or 28 else otherwise.
 */
export function hasECDSASignatureAValidV(signature: string): boolean {
  if (signature.length !== 130) {
    return true
  }

  const lastSignatureByte = getLastECDSASignatureByte(signature)
  return lastSignatureByte === 27 || lastSignatureByte === 28
}

/**
 * Generates an ECDSA signature with a valid V from another signature by changing its V value to 27 or 28 if it was 0 or 1.
 * @param signature - A ECDSA signature.
 * @throws "Invalid signature length" if the given signature has less than 65 bytes.
 * @returns a ECDSA signature based on the given one with its V value as 27 or 28.
 */
export function generateECDSASignatureWithValidV(signature: string): string {
  const isSignatureVValid = hasECDSASignatureAValidV(signature)
  return isSignatureVValid
    ? signature
    : signature.slice(0, -2) + (getLastECDSASignatureByte(signature) + 27).toString(16)
}

/**
 * Generates an ECDSA signature with an invalid V from another signature by changing its V value to 0 or 1 if it was 27 or 28.
 * This function will be used to maintain support of signatures with a V of 0 and 1.
 * @param signature - A ECDSA signature.
 * @throws "Invalid signature length" if the given signature has less than 65 bytes.
 * @returns a ECDSA signature based on the given one with its V value as 27 or 28.
 */
export function generateECDSASignatureWithInvalidV(signature: string): string {
  const isSignatureVValid = hasECDSASignatureAValidV(signature)
  return isSignatureVValid
    ? signature.slice(0, -2) + (getLastECDSASignatureByte(signature) - 27).toString(16)
    : signature
}
