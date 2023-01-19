export class ContractNotFound extends Error {
  constructor(public contractName: string, public chainId: number) {
    super("The contract with the provided name and chain id was not found")
  }
}
