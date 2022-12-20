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
      chainId: ethers.utils.hexZeroPad(ethers.utils.hexlify(chainId), 32),
    }
    types = {
      Listing: [
        { name: "signer", type: "address" },
        { name: "contractAddress", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "expiration", type: "uint256" },
        { name: "indexes", type: "uint256[3]" },
        { name: "pricePerDay", type: "uint256[]" },
        { name: "maxDays", type: "uint256[]" },
        { name: "minDays", type: "uint256[]" },
        { name: "target", type: "address" },
      ],
    }
    values = {
      signer: signerAddress,
      contractAddress: rentalsContract.address,
      tokenId: "0",
      expiration: (Date.now() + 60 * 60 * 1000).toString(),
      indexes: ["0", "0", "0"],
      pricePerDay: ["0", "1", "2"],
      maxDays: ["0", "0", "0"],
      minDays: ["1", "2", "3"],
      target: ethers.constants.AddressZero,
    }
    contractRentalListing = {
      signer: signerAddress,
      contractAddress: values.contractAddress,
      tokenId: values.tokenId,
      expiration: values.expiration,
      indexes: values.indexes,
      pricePerDay: values.pricePerDay,
      maxDays: values.maxDays,
      minDays: values.minDays,
      signature: await wallet._signTypedData(domain, types, values),
      target: ethers.constants.AddressZero,
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
        indexes: values.indexes,
        pricePerDay: values.pricePerDay,
        maxDays: values.maxDays,
        minDays: values.minDays,
        signature: await wallet._signTypedData(domain, types, values),
        target: ethers.constants.AddressZero,
      }
    })

    it("should return false", () => {
      return expect(verifyRentalsListingSignature(contractRentalListing, chainId)).resolves.toBe(false)
    })
  })

  describe("and the signature is not expired, it was signed by the provided address and its V is 28", () => {
    it("should return true", () => {
      return expect(verifyRentalsListingSignature(contractRentalListing, chainId)).resolves.toBe(true)
    })
  })

  describe("and the signature has a V of 0 or 1", () => {
    beforeEach(() => {
      contractRentalListing = {
        signer: "0x343889d9f2a54fc1c790880f8f8dc309ce7359d7",
        contractAddress: "0x959e104e1a4db6317fa58f8295f586e1a978c297",
        tokenId: "4364",
        expiration: new Date("2023-02-28 00:00:00").getTime().toString(),
        indexes: ["0", "0", "0"],
        pricePerDay: ["8000000000000000000"],
        maxDays: ["365"],
        minDays: ["365"],
        signature:
          "0xb7cc6d9d616a6124cdb7dda758346499f5fe883e391bc3018c18eb4cd8f5b9957e1f4d82f5dfe3679262f983d0e587dcffe19c1647574dab439ac084f95570f401",
        target: ethers.constants.AddressZero,
      }
    })

    it("should return false", () => {
      return expect(verifyRentalsListingSignature(contractRentalListing, chainId)).resolves.toBe(false)
    })
  })
})
