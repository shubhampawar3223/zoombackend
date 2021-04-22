const express = require("express");
const http = require("http");
const app = express();
const server = http.createServer(app);
const socket = require("socket.io");
const io = socket(server);
const mongodb = require('mongodb');
const mongoClient = mongodb.MongoClient;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const cors = require('cors');
const port = process.env.PORT || 3500;
const dbUrl = process.env.DB_URL ||  'mongodb://127.0.0.1:27017';
const {ExpressPeerServer} = require('peer');
 const peerServer = ExpressPeerServer(server,{
      debug:true
 })
app.use('/peerjs',peerServer);
let roomID;
const socketToRoom = {};
var messages={
    public:[{
       sender:"raman",
       content:"hello" 
    },
    {   
        sender:"vir",
        content:"hiee" 
     }, 
    ]
};
app.use(express.json());
app.use(cors());

//signup
app.post('/signup',async(req,res)=>{
   try{
    let clientInfo = await mongoClient.connect(dbUrl);
    let db = clientInfo.db('web-app');
    let find = await db.collection('users').findOne({email:req.body.email});
    if(!find){
       let salt = await bcrypt.genSalt(10);
       let hash = await bcrypt.hash(req.body.password, salt);
       req.body.password = hash;
       let response = await db.collection('users').insertOne(req.body);
       console.log(response);
       res.status(200).json({message:"User Created Successfully."});
    }
    else{
       res.status(400).json({message:"User already present."}) 
    }
   }
   catch(e){
    console.log(e);
   }
})

//login 
app.post('/login',async(req,res)=>{
   try{
     let clientInfo = await mongoClient.connect(dbUrl);
     let db = clientInfo.db('web-app');
     let check = await db.collection('users').findOne({email:req.body.email});
     if(check){
       let verify = await bcrypt.compare(req.body.password,check.password);
       if(verify){
           let token = await jwt.sign({user_id:check._id},process.env.JWT_KEY);
           res.status(200).json({message:"Login Success", token:token});
       }
       else{
           res.status(400).json({message:"Invalid Password"})
       }    
     }
     else{
           res.status(404).json({message:"User doesn't exit"});
     }
   }
   catch(e){
     console.log(e);    
   }
})

app.get('/check',authenticate,(req,res)=>{
     res.send("Hiee");
})

//authentication function
function authenticate(req,res,next){
  if(req.headers.authorisation !== undefined){
       jwt.verify(
           req.headers.authorisation,
           process.env.JWT_KEY,
           (error, decode)=>{
              if(error){
                res.status(401).json({message:"NO token"});            
              }
              else{
                next();
              }
           }
       )
  }
  else{
      res.status(401).json({message:"NO token"})
  }
}
 

io.on('connection', socket => {
    let users={};

    socket.on("join room", async(roomID,name) => {
        console.log("Check1");
        try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('rooms');
        let users1 = await db.collection('info').findOne({roomID: roomID});
        if(users1 === null){
            users[roomID]= [];            
            
        }
        else{
            users[roomID]= users1.users;
            
        }
        console.log(roomID);
        console.log(name)
        console.log(users[roomID])
        if (users[roomID].length !== 0) {
            const length = users[roomID].length;
            if (length === 4) {
                socket.emit("room full");
                return;
            }
            users[roomID].push({
                userId:socket.id,
                uName: name
            });
            
           let p = await db.collection('info').findOneAndUpdate({roomID: roomID},{$set:{users:users[roomID]}});
           
        } else {
            users[roomID] = [{
                userId:socket.id,
                uName: name
            }];
            console.log(users[roomID])
            let k = await db.collection('info').insertOne({"roomID":roomID, users:users[roomID]});
            
        }
        await db.collection('socketToRoom').insertOne({"socketID":socket.id, "roomID":roomID});
        //socketToRoom[socket.id] = roomID;
        const usersInThisRoom = users[roomID].filter(e => e.userId !== socket.id);

        socket.emit("all users", usersInThisRoom);
        //for chat
        
        io.emit("remaining users", users[roomID]);
        
        
        }
        catch(e){
            console.log(e);
        } 
        
 
    });

    socket.on("sending signal", payload => {
        io.to(payload.userToSignal).emit('user joined', { signal: payload.signal, callerID: payload.callerID });
    });

    socket.on("returning signal", payload => {
        io.to(payload.callerID).emit('receiving returned signal', { signal: payload.signal, id: socket.id });
    });
    

    //sockets for chat 
    socket.on("join channel", async(channel, isChannel,roomID)=>{
        console.log("check 2")
        console.log(channel, isChannel,roomID);
        let messages={};
        try{
            console.log(messages);    
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('rooms');
        let users1 = await db.collection('info').findOne({roomID: roomID});
        if(users1=== null){
           messages["public"]=[];
           console.log(messages);  
        }
        else{
            messages=users1.messages;
            console.log(messages); 
        }
        if(isChannel){
            socket.join(channel);
            let payload={
            content:messages.public,
            channel:channel
             }
             console.log(payload);
            socket.emit("current messages",payload);
        }
        }
        catch(e){
           console.log(e);
        }
    })
    
    socket.on("send message",async(content, to ,sender, channel, isChannel,roomID)=>{
         console.log(to,content);
         let messages={};
         try{
             console.log(messages);
            let clientInfo = await mongoClient.connect(dbUrl);
            let db = clientInfo.db('rooms');
            let users1 = await db.collection('info').findOne({roomID: roomID});
            if(users1.messages === undefined){
               messages["public"]=[];
               console.log("Here" + messages);  
            }
            else{
                messages=users1.messages;
                console.log("here"+messages); 
            }       
        if(isChannel){
               const payload = {
                   content,
                   channel,
                   sender
               }
               console.log(payload);
               socket.to(to).emit("post message", payload);
           }
           else{
            const payload = {
                content,
                channel:to,
                sender
            }
            socket.emit("post message", payload);   
           }         

           if(content){
              messages["public"].push({
                  sender,
                  content
              })
              console.log(messages);
              await db.collection('info').findOneAndUpdate({roomID: roomID},{$set:{messages:messages}});
           }
        }
        catch(e){
           console.log(e); 
        }
    })


    socket.on('disconnect', async() => {
        try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('rooms');    
        let data = await db.collection('socketToRoom').findOne({"socketID":socket.id});
        console.log(data);
        let roomID = data.roomID; 
        let data1 = await db.collection('info').findOne({roomID:roomID});
        let room = data1.users;
        if (room) {
            room = room.filter(e => e.userId !== socket.id);
            let p = await db.collection('info').findOneAndUpdate({roomID: roomID},{$set:{users:room}});
            await db.collection('socketToRoom').findOneAndDelete({"socketID":socket.id});
        }
       }
       catch(e){
           console.log(e);
       }
    });

});

server.listen(port, () => console.log('server is running on port '+port));