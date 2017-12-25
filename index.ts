#!/usr/bin/env node

import { spawn, spawnSync, ChildProcess } from 'child_process'
import * as net from 'net'
import * as debug from 'debug'
import * as uuid from 'uuid/v4'
import * as _ from 'lodash'

const serverLog = debug('server')
const clientLog = debug('client')

type CompileMessage = {
    type: 'compile'
    connection: net.Socket
    args: string[]
    cwd: string
    clientId: string
    priority: number
}

type Message = CompileMessage

type LogLine = {
    time: number
    text: string
}

type Response = {
    type: 'compile-log'
    code: number
    stdout: LogLine[]
    stderr: LogLine[]
}

const compileQueue: CompileMessage[] = []

function daemon() {
    let currentJob: { message: CompileMessage; process: ChildProcess } | null = null
    let compileStandardOut: LogLine[] = []
    let compileStandardErr: LogLine[] = []

    function process(message: Message) {
        if (message.type === 'compile') {
            const clientId = message.clientId
            if (currentJob) {
                if (currentJob.message.priority > message.priority) {
                    serverLog(
                        clientId,
                        `Killing ${currentJob.message.clientId}:${currentJob.message.priority} in favour of ${
                            message.clientId
                        }:${message.priority}`
                    )

                    compileQueue.push(currentJob.message)
                    currentJob.process.kill()
                } else {
                    serverLog(
                        clientId,
                        `Already compiling a higher priority job ${currentJob.message.clientId}:${
                            currentJob.message.priority
                        } vs ${message.clientId}:${message.priority} adding to queue`
                    )
                    compileQueue.push(message)
                    return
                }
            }

            compileStandardOut = []
            compileStandardErr = []

            currentJob = {
                process: spawn('elm-make', message.args, { cwd: message.cwd }),
                message
            }

            currentJob.process.stdout.on('data', buffer => {
                if (typeof buffer !== 'string') {
                    const str = buffer.toString('utf8')
                    compileStandardOut.push({ time: Date.now(), text: str })
                    serverLog(clientId, str)
                }
            })

            currentJob.process.stderr.on('data', buffer => {
                if (typeof buffer !== 'string') {
                    const str = buffer.toString('utf8')
                    serverLog(clientId, str)
                    compileStandardErr.push({ time: Date.now(), text: str })
                }
            })

            currentJob.process.on('close', code => {
                serverLog(clientId, 'Finished compiling')
                currentJob = null

                const response = {
                    type: 'compile-log',
                    code,
                    stdout: compileStandardOut,
                    stderr: compileStandardErr
                }

                message.connection.write(JSON.stringify(response))

                message.connection.end()

                const nextMessage = compileQueue.shift()
                if (nextMessage) {
                    serverLog(clientId, 'Removing message from queue')
                    process(nextMessage)
                } else {
                    serverLog(clientId, 'No more messages on the queue')
                }
            })
        }
    }

    const server = net.createServer(connection => {
        // 'connection' listener
        serverLog('client connected')

        connection.on('data', buffer => {
            const str = buffer.toString('utf8')
            serverLog('receiving data', str)
            const json = JSON.parse(str)

            const args = json.command.slice(2)
            const cwd = json.cwd
            const clientId = json.clientId
            const priority = json.priority
            process({ type: 'compile', connection, args, cwd, clientId, priority })
        })

        connection.on('end', () => {
            serverLog('client disconnected')
        })
    })

    server.on('error', err => {
        throw err
    })

    server.listen(3111, () => {
        serverLog('server bound')
    })
}

//
// Client Code
//

async function isDaemonRunning() {
    return new Promise((resolve, reject) => {
        const client = net.createConnection({ port: 3111 }, () => {
            clientLog('Found daemon')
            client.end()
            resolve(true)
        })

        client.on('error', err => {
            clientLog('Failed to find daemon')
            client.end()
            resolve(false)
        })
    })
}

async function sendCompile(id: string, command: string[], priority: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        const client = net.createConnection({ port: 3111 }, () => {
            clientLog(id, 'Found daemon for sending command')
        })

        let exitCode = 0

        client.on('data', buffer => {
            const str = buffer.toString('utf8')
            const data: Response = JSON.parse(str)
            clientLog(id, str)

            if (data.type === 'compile-log') {
                exitCode = data.code
                const logs = data.stdout
                    .map(log => ({ ...log, type: 'stdout' }))
                    .concat(data.stderr.map(log => ({ ...log, type: 'stderr' })))

                for (const entry of _.sortBy(logs, 'time')) {
                    if (entry.type === 'stdout') {
                        process.stdout.write(entry.text)
                    } else {
                        process.stderr.write(entry.text)
                    }
                }
            }
        })

        client.on('end', () => {
            clientLog(id, "Received 'end'")
            client.end()
            clientLog(id, 'Ended')
            resolve(exitCode)
        })

        client.on('error', err => {
            clientLog(id, 'Failed to find daemon')
            client.end()

            // Exit code 1 on error
            resolve(1)
        })

        const message = {
            command,
            cwd: process.cwd(),
            clientId: id,
            priority
        }
        client.write(JSON.stringify(message), 'utf8')
    })
}

async function main(command: string[]) {
    if (process.env.ELM_SERVER_VERBOSE) {
        debug.enable('*')
    }

    let priority = 10
    const priorityEnv = process.env.ELM_SERVER_PRIORITY
    if (priorityEnv) {
        priority = parseInt(priorityEnv, 10)
    }

    const id = uuid().slice(0, 5)
    clientLog(id, command)

    const nodeExe = command[0]
    const script = command[1]
    const isDaemon = command[2] === 'daemon'

    if (isDaemon) {
        // Enable server log if we're in daemon mode
        debug.enable('server')

        // If we're meant to be the daemon then set up the daemon
        daemon()
    } else {
        const hasDaemon = await isDaemonRunning()
        if (!hasDaemon) {
            // If we can't find the daemon, then set up the daemon
            clientLog(id, 'Setting up daemon')
            const options = {
                stdio: 'inherit'
            }

            const childProcess = spawn('node', [script, 'daemon'], options)
        } else {
            // We can find the daemon, sent it our command
            const exitCode = await sendCompile(id, command, priority)
            clientLog(id, 'Finished. Status code: ', exitCode)
            process.exit(exitCode)
        }
    }
}

main(process.argv)
