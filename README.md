# elm-make-server

A manager for co-ordinating elm-make instances.


## Problem

The elm-make program does a great job using multiple threads to speed up the compilation.
Unfortunately this can be a problem when there is a more than one instance of elm-make running at a
time. They both go about their job as if they are the only running instance and so end up using too
many threads, stepping on each other and going slowly. More slowly than if run in sequence, I think.


## Benefits of elm-make-server

With elm-make-server you only have one compiler running at any one time. That includes builds
triggered by webpack and by your editor integrations. This means you never hit problems with
multiple compiles being triggered at once and all of them going slowly.

It also allows different compile jobs to have different priorities. Generally you want builds
triggered by your editor integration to have priority over a webpack build as you're expecting
immediate feedback for it to be displayed in your editor. With elm-make-server you can set up your
editor builds to have priority so that lower priority builds are killed to make way for your editor
build and then restarted afterwards without any disruption.


## How

You run a server with `elm-make-server` and then add a new 'elm-make' to your PATH which is a wrapper
script which sends the compilation request to the server instead of running it directly. The server
then makes sure that it is only running one compile at a time.


## Status

Alpha. Feedback welcome.


## Set up

1. Clone this repository
2. Run install with `npm` or `yarn`
3. Run `./setup`. This creates a `bin` directory.
4. Run `elm-make-server`
5. Open a new shell & navigate to your elm project directory
6. Add the `bin` directory created in step 3 to your PATH
7. Run `elm-make`, or your webpack build, or your editor. You should see the build being handled in
   the shell running the server command in step 4.
