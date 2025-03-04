import { Request, Response, Router } from "express";
export const userRouter = Router();
import bcrypt from "bcrypt";
import { memoryModel, userModel } from "../db";
import jwt from "jsonwebtoken";
import { userMiddleware } from "../middlewares/user";
import {
    cosineSimilarity,
    createEmbeddings,
    createQueryEmbeddings,
    giveTweetInfo,
    giveWebsiteInfo,
    giveYoutubeInfo,
} from "../Scraping/helper";
import { getTime,getDate } from "../Scraping/helper";

// Gemini Initialization
import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Signup route
userRouter.post("/signup", async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;
        const isAlreadySignedUp = await userModel.findOne({
            username: username,
        });
        // If username already exists
        if (isAlreadySignedUp) {
            res.status(409).json({
                Message: "Username already used",
            });
            return;
        } else {
            const hashedPassword = await bcrypt.hash(password, 10);
            await userModel.create({
                username: username,
                password: hashedPassword,
            });
            res.status(200).json({
                Message: "Signed Up successfully",
            });
            return;
        }
    } catch (error: any) {
        console.log(error);
        res.status(200).json({
            "Error": error,
        });
    }
});

userRouter.post("/signin", async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;
        const isSignedUp = await userModel.findOne({
            username: username,
        });
        // If not Signed Up Yet
        if (!isSignedUp) {
            res.status(400).json({
                Message: "Username not registered yet",
            });
            return;
        }

        const registeredPassword = isSignedUp.password;
        const isPasswordRight = await bcrypt.compare(password, registeredPassword);
        if (isPasswordRight) {
            const objectId = isSignedUp._id;

            const JWTToken = jwt.sign(
                {
                    objectId: objectId,
                },
                process.env.JWT_SECRET as string
            );

            res.status(200).send(JWTToken);
        } else {
            res.status(401).json({
                Message: "Wrong password",
            });
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({
            Error: error,
        });
    }
});

// Protected Endpoints
interface extendedRequest extends Request {
    objectId?: string;
}

userRouter.post(
    "/addMemory",
    userMiddleware,
    async (req: extendedRequest, res: Response) => {

        const type = req.body.type;
        const creatorId = req.objectId;
        const currentTime = getTime();
        const currentDate = getDate();
        
        try {
            if (type == "Note") {
                const { title, description } = req.body;
                const embeddings = await createEmbeddings({
                    title: title,
                    description: description,
                });
                const newMemory = await memoryModel.create({
                    title,
                    description,
                    creationTime: currentTime,
                    creationDate: currentDate,
                    embeddings: embeddings,
                    creatorId: creatorId,
                    type,
                });
                const memoryWithoutEmbeddings=newMemory.toObject() as {[key:string]:any}
                // As embeddings are not needed in frontEnd
                delete memoryWithoutEmbeddings.embeddings 
                res.status(200).json({
                    NewMemory: memoryWithoutEmbeddings,
                });
            }
            if (type == "Youtube") {
                // If the given link is website link
                let link = req.body.link as string;

                // If the given link is share link
                if(!link.includes("watch")){
                    const videoId=link.split('?')[0].split('/')[3]
                    link=`https://www.youtube.com/watch?v=${videoId}`
                }
                
                const { title, description, channelName } = await giveYoutubeInfo(link);

                const embeddings = await createEmbeddings({
                    title,
                    description,
                    creatorName: channelName,
                });

                const newMemory = await memoryModel.create({
                    type: "Youtube",
                    title,
                    creationTime: currentTime,
                    creationDate: currentDate,
                    embeddings,
                    creatorId: creatorId,
                    link: link,
                });
                
                const memoryWithoutEmbeddings=newMemory.toObject() as {[key:string]:any}
                // As embeddings are not needed in frontEnd
                delete memoryWithoutEmbeddings.embeddings 
                res.status(200).json({
                    NewMemory: memoryWithoutEmbeddings,
                });
            }
            if (type == "Twitter") {
                // If Website link
                let link = req.body.link;
                // If share link
                if(link.includes('?')){
                    link=link.split('?')[0]
                }

                const { description, creatorName } = await giveTweetInfo(link)
                const embeddings = await createEmbeddings({ description, creatorName })
                const newMemory = await memoryModel.create({
                    type: "Twitter",
                    description,
                    creationTime: currentTime,
                    creationDate: currentDate,
                    embeddings,
                    creatorId: creatorId,
                    link: link
                })
                const memoryWithoutEmbeddings=newMemory.toObject() as {[key:string]:any}
                // as embeddings are not required in frontned
                delete memoryWithoutEmbeddings.embeddings 
                res.status(200).json({
                    NewMemory: memoryWithoutEmbeddings,
                });
            }
            if(type=="Website") {
                const link=req.body.link
                const { title,description,logoUrl }=await giveWebsiteInfo(link)
                const embeddings = await createEmbeddings({ title, description })
                const newMemory = await memoryModel.create({
                    type: "Website",
                    title,
                    description,
                    creationTime: currentTime,
                    creationDate: currentDate,
                    embeddings,
                    creatorId: creatorId,
                    link: link,
                    logoUrl:logoUrl
                })
                const memoryWithoutEmbeddings=newMemory.toObject() as {[key:string]:any}
                // as embeddings are not required in frontned
                delete memoryWithoutEmbeddings.embeddings 
                res.status(200).json({
                    NewMemory: memoryWithoutEmbeddings,
                });
            }
        } catch (error) {
            res.status(500).json({
                "Message": error,
            });
        }
    }
);

userRouter.post(
    "/getRelatedMemories",
    userMiddleware,
    async (req: extendedRequest, res: Response) => {
        const query = req.body.query;
        const creatorId = req.objectId;
        try {
            const allMemories = await memoryModel.find({
                creatorId: creatorId,
            });

            const queryEmbeddings = await createQueryEmbeddings(query);
            // Creating array of memories along with their respective score
            const memoryEmbeddingScore = allMemories.map((memory) => ({
                ...memory.toObject(),
                score: cosineSimilarity(memory.embeddings, queryEmbeddings),
            }));
            
            // Sorting according to score in descending order
            memoryEmbeddingScore.sort((a, b) => b.score - a.score);
            
            const memoriesToBeSent = memoryEmbeddingScore
            .slice(0, 10)
            .filter((memory) => memory.score > 0.55)
            .map((memory) => {
                const tempMemory=memory as { [key: string]: any };
                delete tempMemory.embeddings
                delete tempMemory.score
                return tempMemory
            })

            res.json({
                topMemories: memoriesToBeSent
            });

        } catch (error) {
            res.status(500).json({
                "Error": error,
            });
        }
    }
);

userRouter.get("/getAllMemories",userMiddleware,async (req:extendedRequest,res:Response)=>{
    const creatorId = req.objectId;

    try{
        const allMemories=await memoryModel.find({
            creatorId:creatorId
        })
        
        const memoriesWithoutEmbeddings=allMemories.map((memory)=>{
            const tempMemory=memory.toObject() as { [key: string]: any };
            delete tempMemory.embeddings;
            return tempMemory
        })
        
        res.status(200).json({
            
            "allMemories":memoriesWithoutEmbeddings
        })
    }
    catch(error){
        res.status(500).json({
            "Message":error
        })
    }
})

userRouter.post("/updateMemory",userMiddleware,async (req:extendedRequest,res:Response)=>{

    const memoryObjectId=req.body.memoryObjectId
    const creatorId = req.objectId;
    const currentState = req.body.currentState === "true"; 

    try{
    const updateInfo=await memoryModel.updateOne({
        _id:memoryObjectId,
        creatorId:creatorId
    },{$set:{
        bookmark:!currentState
    }})

    res.status(200).json({
        "UpdateInfo":updateInfo
    })
    }
    catch(error){
        res.status(500).json({
            "Error":error
        })
    }
    
})

userRouter.post("/deleteMemory",userMiddleware,async (req:extendedRequest,res:Response)=>{
    
    const memoryObjectId=req.body.memoryObjectId
    const creatorId = req.objectId;
    
    try{
    const deleteInfo=await memoryModel.deleteOne({
        _id:memoryObjectId,
        creatorId:creatorId
    })
    res.status(200).json({
        "DeleteInfo":deleteInfo
    })
    }
    catch(error){
        res.status(500).json({
            "Error":error
        })
    }
})

userRouter.post("/askGemini",userMiddleware,async(req:extendedRequest,res:Response)=>{
    const prompt=req.body.prompt
    try{
    const result = await model.generateContent(prompt);
    // console.log(result.response.text());
     result.response.text()
    res.status(200).json({
        "Response":result.response.text()
    })
    }
    catch(error){
        res.status(500).json({
            "Error":error
        })
    }
})