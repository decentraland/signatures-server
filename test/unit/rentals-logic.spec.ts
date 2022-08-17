import { ChainId } from "@dcl/schemas"
import { ContractData, ContractName, getContract } from "decentraland-transactions"
import { ethers } from "ethers"
import { TypedDataDomain, TypedDataField } from "@ethersproject/abstract-signer"
import { ContractRentalListing, verifyRentalsListingSignature } from "../../src/logic/rentals"

describe("when verifying the rentals listings signature", () => {
  let contractRentalListing: ContractRentalListing
  let chainId: ChainId
  let signerAddress: string
  let wallet: ethers.Wallet
  let values: Record<string, any>
  let domain: TypedDataDomain
  let types: Record<string, TypedDataField[]>

  beforeEach(async () => {
    wallet = ethers.Wallet.createRandom()
    signerAddress = (await wallet.getAddress()).toLowerCase()
    chainId = ChainId.ETHEREUM_GOERLI
    const rentalsContract: ContractData = getContract(ContractName.Rentals, chainId)
    domain = {
      name: rentalsContract.name,
      verifyingContract: rentalsContract.address,
      version: rentalsContract.version,
      salt: ethers.utils.hexZeroPad(ethers.utils.hexlify(chainId), 32),
    }
    types = {
      Listing: [
        { name: "signer", type: "address" },
        { name: "contractAddress", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "expiration", type: "uint256" },
        { name: "nonces", type: "uint256[]" },
        { name: "pricePerDay", type: "uint256[]" },
        { name: "maxDays", type: "uint256[]" },
        { name: "minDays", type: "uint256[]" },
      ],
    }
    values = {
      signer: signerAddress,
      contractAddress: rentalsContract.address,
      tokenId: "0",
      expiration: (Date.now() + 60 * 60 * 1000).toString(),
      nonces: ["0", "0", "0"],
      pricePerDay: ["0", "1", "2"],
      maxDays: ["0", "0", "0"],
      minDays: ["1", "2", "3"],
    }
    contractRentalListing = {
      signer: signerAddress,
      contractAddress: values.contractAddress,
      tokenId: values.tokenId,
      expiration: values.expiration,
      nonces: values.nonces,
      pricePerDay: values.pricePerDay,
      maxDays: values.maxDays,
      minDays: values.minDays,
      signature: await wallet._signTypedData(domain, types, values),
    }
  })

  describe("and the signature was signed by a different address", () => {
    let otherAddress: string

    beforeEach(async () => {
      otherAddress = "0x165cd37b4c644c2921454429e7f9358d18a45e14"
      contractRentalListing = {
        signer: otherAddress,
        contractAddress: values.contractAddress,
        tokenId: values.tokenId,
        expiration: values.expiration,
        nonces: values.nonces,
        pricePerDay: values.pricePerDay,
        maxDays: values.maxDays,
        minDays: values.minDays,
        signature: await wallet._signTypedData(domain, types, values),
      }
    })

    it("should return false", () => {
      return expect(verifyRentalsListingSignature(contractRentalListing, chainId)).resolves.toBe(false)
    })
  })

  describe("and the signature is not expired and was signed by the provided address", () => {
    it("should return true", () => {
      return expect(verifyRentalsListingSignature(contractRentalListing, chainId)).resolves.toBe(true)
    })
  })
})
