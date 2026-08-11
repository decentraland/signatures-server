import { IHttpServerComponent } from '@dcl/core-commons'

export async function withSignerValidation(
  ctx: IHttpServerComponent.DefaultContext<any>,
  next: () => Promise<IHttpServerComponent.IResponse>
): Promise<IHttpServerComponent.IResponse> {
  // Normalized rather than compared exactly: the signed payload is lowercased, so casing is not
  // covered by the signature and a scene can deliver any spelling with a still-valid signature.
  // @dcl/crypto-middleware v5 rejects non-canonical metadata upstream, but this must not depend on
  // that guard staying in place.
  const signer = ctx.verification?.authMetadata?.signer
  if (typeof signer === 'string' && signer.trim().toLowerCase() === 'decentraland-kernel-scene') {
    return {
      status: 400,
      body: 'Invalid signer',
    }
  }

  return await next()
}
