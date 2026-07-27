import app from "./app.js";
import dotenv from 'dotenv';

dotenv.config();

let port=process.env.PORT;

app.listen(port,()=>{
    console.log("server started at ",port);
})
