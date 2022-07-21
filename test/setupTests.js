const path = require("path")
const { existsSync, copyFileSync } = require("fs")

module.exports = async function () {
  const defaultEnvironmentFilePath = path.join(__dirname, "../.env.default")
  const environmentFilePath = path.join(__dirname, "../.env")
  console.log("Running setup function", defaultEnvironmentFilePath, environmentFilePath)

  if (!existsSync(environmentFilePath)) {
    if (!existsSync(defaultEnvironmentFilePath)) {
      throw new Error("An .env file is needed to run the tests")
    }

    copyFileSync(defaultEnvironmentFilePath, environmentFilePath)
  }
}
