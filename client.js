const net = require('node:net');
const fs = require('fs');
const fsp = fs.promises; 
const path = require('node:path');
const readline = require("readline/promises");

const port=8000;
const host = "::1";
const ACTION_INDEX = 2, FILE_INDEX = 3;


const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

var args = process.argv;

var action = (ACTION_INDEX in args)?args[ACTION_INDEX]:'';
var filePath = (FILE_INDEX in args)?args[FILE_INDEX]:'';
var nextIter = false;

async function ask(msg) {
    let message = await rl.question(msg);
    // move the cursor one line up
    process.stdout.moveCursor(0,-1);
    // clear the current line that the cursor is in
    process.stdout.clearLine(0);
    return message;
};

const createSocket = async (user) => { 
    return new Promise((resolve,reject) => {
        let socket = net.connect( port, host, async () => {
            if(action === ''){
                socket.destroy(new Error("Missing Params"));
            }
            
            if(filePath === ''){
                filePath = action;
                action = 'Upload';
            }else{
                action = (action.toLocaleLowerCase() === 'd' || action.toLocaleLowerCase() === 'download')?'Download':'Upload';
            }
            
            if(action !== 'Upload' && action !== 'Download'){
                socket.destroy(new Error("Invalid Action"));
            }
            
            console.log(action, filePath);

            var fileName = path.basename(filePath);

            socket.write("DTYPE__JSON-"+JSON.stringify({fileName,action,user}));
            
            let fileHandle = null, fileStream = null;

            if(action == 'Upload'){
                const fileStat = fs.existsSync(filePath);
                // console.log("fileStat", fileStat, filePath);
                if(fileStat == false){
                    socket.destroy(new Error("File Doesnot Exist"));
                    return;
                }

                var fileSize = (await fsp.stat(filePath)).size;
                var uploadedSize = 0;
                fileHandle = await fsp.open(filePath,'r');
                fileStream = fileHandle.createReadStream();
                console.log();
                
                fileStream.on("data",(data) => {
                    uploadedSize += data.length;
                    process.stdout.moveCursor(0,-1);
                    process.stdout.clearLine(0);
                    console.log("Progress: "+Math.ceil((uploadedSize/fileSize)*100)+"%");
                    if (!socket.write(data)) {
                        fileStream.pause();
                    }
                })

                fileStream.on("end",()=>{
                    console.log("readstream end");
                    socket.end(); // trigger socket end event on both client and server.
                })

                socket.on("drain", ()=>{
                    fileStream.resume();
                })

            }else if(action == 'Download'){
                fileHandle = await fsp.open(fileName,'w');
                fileStream = fileHandle.createWriteStream();

                socket.dataSize = null;
                socket.receivedData = 0;
                socket.on("data",(data)=>{
                    if(socket.dataSize === null){
                        var metaData = data.toString("utf-8");
                        if(metaData.startsWith("DTYPE__JSON")){
                            // console.log(metaData);
                            var data = JSON.parse(metaData.split("-")[1]);
                            if(data.error){
                                fileStream.close();
                                fileHandle.close();
                                fs.rmSync(filePath);
                                return socket.destroy(data.error); // trigger error event
                            }
                            socket.dataSize = data.size;
                            console.log(data);
                            console.log();
                        }
                    }else{
                        socket.receivedData += data.length;
                        var progress = Math.ceil((socket.receivedData/socket.dataSize) * 100)+"%";
                        process.stdout.moveCursor(0,-1);
                        process.stdout.clearLine(0);
                        console.log("Progress: "+progress);
                        if(!fileStream.write(data)){
                            socket.pause();      
                        };
                    }
                })

                fileStream.on("drain",()=>{
                    socket.resume();
                })
            }

            socket.on("end", () => {
                console.log("Progress Completed");
                fileHandle && fileHandle.close();
                fileHandle = null;
                fileStream && fileStream.close();
                fileStream = null;
                nextIter = true;
                resolve("completed");
                // process.exit(0);
            })

            socket.on("error",(err)=>{
                if(err.code == 'ECONNREFUSED'){
                    console.log("Server Down");
                }else if(err.code == 'ENOENT'){
                    console.log("File Not Found");
                }else{
                    console.log(err);
                }
                nextIter = false;
                reject(err);
                // process.exit(0);
            });
        })
    });
}

(async function main(){

    let user = {};
    user.userName = await ask("Please enter name: \t");
    user.userName = user.userName+Math.floor(Date.now()/1000)+"_"+Math.floor(Math.random()*1000);
    console.log("Your User Id: ",user.userName);

    while(true){
        nextIter = false;
        if(action === ''){
            action = await ask("what you want to do? \t");
        }
        if(action.toLowerCase() == 'quit'){
            process.exit(0);
        }

        if(action.toLowerCase().charAt(0) === 'd'){
            user.userDownload = await ask("Enter User whom file u want to download (leave blank if you are the owner of file) \t");
            if(user.userDownload === '') user.userDownload = user.userName;
        }
        if(filePath === ''){
            filePath = await ask("which file you want to? \t");
        }
        
        await createSocket(user)
            .then((data)=>{
                console.log(data);
            }).catch((err) => {
                console.log(err);
            });

        if(nextIter){
            console.log();
            action = '';
            filePath = '';
        }else{
            process.exit(1);
        }
    }
})();