# this folder contains scripts related to azure devops

## preparations
- install the azure cli tool

## usage
- first create a .env file by copying .env.example and filling in the values
- next use az-login.sh to login to use the az cli

* az-app-info.sh -> show info about the azure webapp
* az-app-download-logs -> get application logs (useful if the app refuses to start up)
* az-app-restart -> guess what this does :-)

# setup web app for next js startup
* az-app-set-config -> setup web app for next js startup (node server.js) 

Make sure you are in the azure folder when executing the files.