#!/usr/bin/env node

import { spawn, spawnSync } from 'child_process'
import * as net from 'net'
import * as chokidar from 'chokidar'
import * as debug from 'debug'
import * as uuid from 'uuid/v4'

debug.enable('*')

const serverLog = debug('server')
const clientLog = debug('client')

type CompileMessage = {
    type: 'compile'
    connection: net.Socket
    args: string[]
    cwd: string
    clientId: string
}

type FileMessage = {
    type: 'file-event'
    event: string
    path: string
}

type Message = CompileMessage | FileMessage

const compileQueue: CompileMessage[] = []

function daemon() {
    let compiling = false

    function process(message: Message) {
        if (message.type === 'compile') {
            const clientId = message.clientId
            if (compiling) {
                serverLog(clientId, 'Already compiling adding to queue')
                compileQueue.push(message)
                return
            }

            compiling = true

            const elmMake = spawn('elm-make', message.args, { stdio: 'inherit' })

            elmMake.on('close', code => {
                serverLog(clientId, 'Finished compiling')
                compiling = false
                message.connection.end()

                const nextMessage = compileQueue.shift()
                if (nextMessage) {
                    serverLog(clientId, 'Removing message from queue')
                    process(nextMessage)
                } else {
                    serverLog(clientId, 'No more messages on the queue')
                }
            })
        } else if (message.type === 'file-event') {
            serverLog('file changed', message.path)
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
            process({ type: 'compile', connection, args, cwd, clientId })
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

    chokidar.watch('./src').on('all', (event: string, path: string) => {
        process({ type: 'file-event', event, path })
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

async function sendCompile(id: string, command: string[]) {
    return new Promise((resolve, reject) => {
        const client = net.createConnection({ port: 3111 }, () => {
            clientLog(id, 'Found daemon for sending command')
        })

        client.on('end', () => {
            clientLog(id, "Received 'end'")
            client.end()
            clientLog(id, 'Ended')
            resolve(true)
        })

        client.on('error', err => {
            clientLog(id, 'Failed to find daemon')
            client.end()
            resolve(false)
        })

        const message = {
            command,
            cwd: process.cwd(),
            clientId: id
        }
        client.write(JSON.stringify(message), 'utf8')
    })
}

async function main(command: string[]) {
    const id = uuid().slice(0, 5)
    clientLog(id, command)

    const nodeExe = command[0]
    const script = command[1]
    const isDaemon = command[2] === 'daemon'

    if (isDaemon) {
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
            await sendCompile(id, command)
            clientLog(id, 'Finished')
        }
    }
}

main(process.argv)
