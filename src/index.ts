import { Lifecycle } from "@well-known-components/interfaces"
import { initComponents } from "./components"
import { main } from "./service"

// This file is the program entry point, it only calls the Lifecycle function.
// The lifecycle owns the process from here on, nothing is left to await it.
void Lifecycle.run({ main, initComponents })
