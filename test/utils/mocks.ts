/**
 * Resets a stubbed component method and makes any call a spec did not explicitly program fail
 * loudly. Needed because the test runner stubs components with `jest.spyOn`, and resetting such a
 * mock restores the component's real implementation, which would perform real I/O on the next call.
 * @param mock - The stubbed method to reset.
 * @param name - The name reported when an unprogrammed call happens.
 */
export function resetToUnexpected(mock: jest.MockInstance<any, any>, name: string): void {
  mock.mockReset()
  mock.mockImplementation(() => {
    throw new Error(`Unexpected call to ${name}`)
  })
}
