# Craig Webapp

The Craig Webapp allows users to connect to ongoing recording sessions within Craig and either monitor activity or join as a seperate user.

The app is based off of [ennuicastr](https://github.com/ennuicastr/ennuicastr) with a modified protocol to fit more to its usecase.  The app connects to the [webapp-server](https://github.com/CraigChat/webapp-server) and records your microphone to send to the server.

The Audio Worker Processor (AWP) is also built seperately to the `public` folder since vite was annoying about it.

### Development
> Note: that web workers will not work within `yarn dev` and will need to use `yarn dev:preview` instead.

Running this app on localhost enables the "Local" server option.

You can enable a custom server by appending `custom=example.com` to the URL. The server must be secure.