export class UnauthorizedToRent extends Error {
  constructor(public ownerAddress: string, public lessorAddress: string) {
    super("The owner of the token is not the lessor, it can't rent the token")
  }
}

export class NFTNotFound extends Error {
  constructor(public contractAddress: string, public tokenId: string) {
    super("The NFT was not found")
  }
}

export class RentalAlreadyExists extends Error {
  constructor(public contractAddress: string, public tokenId: string) {
    super("An open rental already exists for this token")
  }
}

export class InvalidSignature extends Error {
  constructor() {
    super("The provided signature is invalid")
  }
}
