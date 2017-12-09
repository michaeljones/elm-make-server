
import { spawn } from 'child_process'

function main(args: string[]) {

    console.log(args)

    const nodeExe = args[0]
    const script = args[1]
    const isDaemon = args[2] === 'daemon'

    if (!isDaemon) {
        const options = {
            stdio: 'inherit'
        }

        const childProcess = spawn('ts-node', [script, "daemon"], options)
    }
}

main(process.argv)
