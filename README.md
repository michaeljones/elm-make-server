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

Alpha. I've been putting this together in my spare time and haven't had a chance to test to
thoroughly in my work set up. The basics seem to be in place though.


## Feedback

Please let me know if you use it and have any luck! Suggestions & changes welcome. It would be nice
to improve the user-friendliness of the set up.

## Set up

1. Clone this repository
2. Run install with `npm` or `yarn`
3. Run `./setup`. This creates a `bin` directory with our `elm-make` replacment script.
4. Run `elm-make-server`
5. Open a new shell & navigate to your elm project directory
6. Add the `bin` directory created in step 3 to your PATH
7. Run `elm-make`, or your webpack build, or your editor. You should see the build being handled in
   the shell running the server command in step 4.


## Prioritising Jobs

As mentioned above it can be used for different build jobs to have different priorities. I would
rather my editor integration `elm-make` was prioritised over the webpack build.

To achieve this you can set an `ELM_SERVER_PRIORITY` environment variable. Priority `1` is the highest
priority. The default value is `10`. In my typical set up, I would have `1` in my editor set up, `5`
in the shell that I sometimes do builds from and `10` in the webpack shell.


## Webpack

I have struggled to get the `elm-make` replacement script to work with Webpack. Somehow it finds the
old `elm-make` executable despite my best efforts. To work around that you can use the `pathToMake`
configuration for the `elm-webpack-loader` to point directly at the `elm-make` script created in
step 3 of the set up above.

