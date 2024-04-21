const net = require('node:net');
const fs = require('fs');
const fsp = fs.promises; 
const path = require('node:path');

const port=8000;
const host = "::1";
const ACTION_INDEX = 2, FILE_INDEX = 3;

const socket = net.connect( port, host, async () => {

    var args = process.argv;

    var action = (ACTION_INDEX in args)?args[ACTION_INDEX]:'';
    var filePath = (FILE_INDEX in args)?args[FILE_INDEX]:'';

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

    socket.write("DTYPE__JSON-"+JSON.stringify({fileName,action}));
    
    let fileHandle, fileStream;

    if(action == 'Upload'){
        const fileStat = fs.existsSync(fileName); 
        if(fileStat == false){
            socket.destroy(new Error("File Doesnot Exist"));
        }

        var fileSize = (await fsp.stat(fileName)).size;
        var uploadedSize = 0;
        fileHandle = await fsp.open(fileName,'r');
        fileStream = fileHandle.createReadStream();
        console.log();
        
        fileStream.on("data",(data) => {
            uploadedSize += data.length;
            process.stdout.moveCursor(0,-1);
            process.stdout.clearLine(0);
            console.log("Progress: "+Math.ceil(uploadedSize/fileSize)*100+"%");
            if (!socket.write(data)) {
                fileStream.pause();
            }
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
                    var data = JSON.parse(metaData.split("-")[1]);
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

    socket.on("end", ()=>{
        console.log("Progress Completed");
    })

    socket.on("error",(err)=>{
        if(err.code == 'ECONNREFUSED'){
            console.log("Server Down");
        }
    });
});
