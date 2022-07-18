import { AppComponents } from "../../types"
import { IJobComponent, JobOptions } from "./types"

export function createJobComponent(
  components: Pick<AppComponents, "logs">,
  job: () => any,
  onTime: number,
  { repeat = true, startupDelay = 0, onError = () => undefined, onFinish = () => undefined }: JobOptions = {
    repeat: true,
    startupDelay: 0,
    onError: () => undefined,
    onFinish: () => undefined,
  }
): IJobComponent {
  const { logs } = components
  let runningJob: Promise<any> = Promise.resolve()
  let shouldStop: boolean = false
  let timeout: ReturnType<typeof setTimeout> | undefined
  let resolveSleepCancel: ((value: unknown) => void) | undefined
  const logger = logs.getLogger("job")

  async function sleep(time: number) {
    return new Promise((resolve) => {
      resolveSleepCancel = resolve
      timeout = setTimeout(() => {
        resolveSleepCancel = undefined
        timeout = undefined
        resolve(undefined)
      }, time)
    })
  }

  function cancelSleep() {
    if (timeout && resolveSleepCancel) {
      clearTimeout(timeout)
      resolveSleepCancel(undefined)
    }
  }

  function start() {
    // Start the job but don't wait for it
    runJob()
  }

  async function runJob() {
    await sleep(startupDelay)
    while (!shouldStop) {
      await sleep(onTime)
      try {
        runningJob = job()
        await runningJob
      } catch (error) {
        onError(error)
      }
      logger.info("[Executed]")
      if (!repeat) {
        break
      }
    }
    await onFinish()
    logger.info("[Stopped]")
  }

  async function stop() {
    logger.info("[Cancelling]")
    shouldStop = true
    cancelSleep()
    await runningJob
    logger.info("[Cancelled]")
  }

  return {
    start,
    stop,
  }
}
