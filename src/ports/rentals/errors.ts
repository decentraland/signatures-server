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

export class RentalAlreadyExpired extends Error {
  constructor(public contractAddress: string, public tokenId: string, public expiration: number) {
    super("The rental listings is already expired")
  }
}

export class RentalNotFound extends Error {
  constructor(public id?: string) {
    super("The rental was not found")
  }
}

export class InvalidSignature extends Error {
  constructor(public reason?: string) {
    super(`The provided signature is invalid${reason ? `: ${reason}` : ""}`)
  }
}

export class InvalidRentalContractAddress extends Error {
  constructor(public rentalContractAddress: string, public expectedRentalContractAddress: string) {
    super("The rental contract address does not match the Rentals contract of the given chain")
  }
}

export class UnsupportedChain extends Error {
  constructor(public chainId: number, public network: string) {
    super("The chain id and network of the listing are not the ones supported by the server")
  }
}

export class InvalidEstate extends Error {
  constructor(public contractAddress: string, public tokenId: string) {
    super("Estates with size 0 can't be listed for rent")
  }
}
