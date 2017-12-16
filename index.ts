#!/usr/bin/env node

import { spawn, spawnSync } from 'child_process'
import * as net from 'net'
import * as chokidar from 'chokidar'

type CompileMessage = {
    type: 'compile'
    connection: net.Socket
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
            if (compiling) {
                console.log('Already compiling adding to queue')
                compileQueue.push(message)
                return
            }

            compiling = true

            const elmMake = spawn('elm-make', [], { stdio: 'inherit' })

            elmMake.on('close', code => {
                compiling = false
                message.connection.end()

                const nextMessage = compileQueue.shift()
                if (nextMessage) {
                    console.log('Removing message from queue')
                    process(nextMessage)
                } else {
                    console.log('No more messages on the queue')
                }
            })
        } else if (message.type === 'file-event') {
            console.log('file changed', message.path)
        }
    }

    const server = net.createServer(connection => {
        // 'connection' listener
        console.log('client connected')

        connection.on('data', buffer => {
            const str = buffer.toString('utf8')
            console.log('receiving data', str)
            const json = JSON.parse(str)

            process({ type: 'compile', connection })
        })

        connection.on('end', () => {
            console.log('client disconnected')
        })
    })

    server.on('error', err => {
        throw err
    })

    server.listen(3111, () => {
        console.log('server bound')
    })

    chokidar.watch('./src').on('all', (event: string, path: string) => {
        process({ type: 'file-event', event, path })
    })
}

async function isDaemonRunning() {
    return new Promise((resolve, reject) => {
        const client = net.createConnection({ port: 3111 }, () => {
            console.log('Found daemon')
            client.end()
            resolve(true)
        })

        client.on('error', err => {
            console.log('Failed to find daemon')
            client.end()
            resolve(false)
        })
    })
}

async function sendCompile(args: string[]) {
    return new Promise((resolve, reject) => {
        const client = net.createConnection({ port: 3111 }, () => {
            console.log('Found daemon for sending args')
        })

        client.on('end', () => {
            client.end()
            resolve(true)
        })

        client.on('error', err => {
            console.log('Failed to find daemon')
            client.end()
            resolve(false)
        })

        client.write(JSON.stringify(args), 'utf8')
    })
}

async function main(args: string[]) {
    console.log(args)

    const nodeExe = args[0]
    const script = args[1]
    const isDaemon = args[2] === 'daemon'

    if (isDaemon) {
        // If we're meant to be the daemon then set up the daemon
        daemon()
    } else {
        const hasDaemon = await isDaemonRunning()
        if (!hasDaemon) {
            // If we can't find the daemon, then set up the daemon
            console.log('Setting up daemon')
            const options = {
                stdio: 'inherit'
            }

            const childProcess = spawn('node', [script, 'daemon'], options)
        } else {
            // We can find the daemon, sent it our args
            sendCompile(args)
        }
    }
}

main(process.argv)
