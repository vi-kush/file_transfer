const net = require('net');
const fs = require('fs');
const fsp = require('fs/promises');

const server = net.createServer();
const port=8000;
const host = "::1";
const serverFilePath = 'storage/'

const clientDict = {};

var checkOrCreateFile = function(name) {
	return new Promise((resolve,reject)=>{
		fs.opendir(name, (err,msg) => {
			console.log("inside checkOrCreate",err);
			if(err){
				if(err.code = 'ENOENT'){
					fs.mkdir(name, (err,msg) => {
						if(err) reject(err);
						else resolve();
					});
				}else reject(err);
			}else resolve();
		})
	})
}

server.on("connection",  (socket)=>{

	//attributes defined in socket server side is not available on client end. 
	socket.wfd = null;
	socket.rfd = null;
	socket.action = null;

	socket.id = socket.remoteAddress+":"+socket.remotePort;

	// Object.getOwnPropertySymbols(socket)
	console.log(socket.id,socket[Object.getOwnPropertySymbols(socket)[0]]);
	socket.on("data", async (data) => {
		
		let fileHandle;
		if(socket.action == null){
			socket.pause();
			var metaData = data.toString("utf-8");
			if(metaData.startsWith("DTYPE__JSON")){
				var data = JSON.parse(metaData.split("-")[1]);
				var action = data.action;
				var fileName = data.fileName;
				socket.action = action;
				socket.user = data.user;
				console.log("data",data);
			}
			if(action == 'Upload'){
				const filePath = serverFilePath+socket.user.userName+"/";
				await checkOrCreateFile(filePath+"/");
				fileHandle = await fsp.open(filePath+fileName,"w");
				socket.wfd = fileHandle.createWriteStream();
				socket.fh = fileHandle;

				socket.wfd.on("finish",() => {
					console.log('wfd finished');
					socket.wfd.close(); //trigger close event.
					socket.wfd = null;
					socket.action = null;
				});
				socket.wfd.on("close",() => {
					console.log('wfd closed');
				});

				socket.wfd.on("drain",()=>{
					socket.resume();
				})

				socket.resume();
			}else if(action == 'Download'){
				const filePath = serverFilePath+socket.user.userDownload+"/"+fileName;
				const fileStat = fs.stat(filePath, async (err,stat) => {
					if(err){
						socket.end("DTYPE__JSON-"+JSON.stringify({error:{code:err.code}}));
						// socket.destroy(new Error("File Doesnot Exist"));
						return;
					}
					var size = stat.size;
					socket.write("DTYPE__JSON-"+JSON.stringify({size}));

					fileHandle = await fsp.open(filePath,"r");
					socket.rfd = fileHandle.createReadStream();
					socket.fh = fileHandle;

					socket.rfd.on("end",() => {
						console.log("Ended rfd");
						socket.action = null;
				
						if(socket.rfd != null && socket.rfd instanceof fs.ReadStream){
							console.log("read closed");
							socket.rfd.close();
							socket.rfd = null;
							socket.fh.close();
						}

						socket.end();
					})

					socket.rfd.on("data",(data) => {

						if(!socket.write(data)){ // write data to socket
							socket.rfd.pause(); // pause data reading 
						};
					})
					socket.on("drain",()=>{ // on buffer clear
						socket.rfd.resume(); // start reading data
					})
					socket.resume();
				}); 
			}
		}else{
			if(socket.action == 'Upload'){
				if(!socket.wfd.write(data)){
					socket.pause();
				};
			}else if(socket.action == 'Download'){

			}
		}

    })

    // socket.write("hi");

	socket.on('end', ()=> {
		console.log("Socket Ended");
		socket.wfd && socket.wfd instanceof fs.WriteStream && socket.wfd.end(); // trigger finish event
		socket.fh.close();
	});

	socket.on("close",() => {
		console.log("socket Closed"); //emit after end/error
	});

	socket.on("error",(err) => {
		if(err.code == "ECONNRESET") {
			console.log("Got ECONNRESET, continue!");
		} else {
			console.log(err);
			process.exit(1);
		}
		socket.action = null;

		if(socket.wfd != null && socket.wfd instanceof fs.WriteStream) socket.wfd.close();
		socket.wfd = null;
		
		if(socket.rfd != null && socket.rfd instanceof fs.ReadStream) socket.rfd.close();
		socket.rfd = null;
	});

})

server.listen(port, host, async ()=>{
    console.log("listening on", server.address());
	let dirStat = await checkOrCreateFile(serverFilePath);
	console.log("dirStat",dirStat);
})

server.on("error", (err)=>{
	if (err.code == 'EADDRINUSE') {
		console.log('Error: Address in use ' + host +':'+ port);
	}
})