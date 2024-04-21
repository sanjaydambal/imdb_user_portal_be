const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 4001;
const cors = require('cors');
app.use(cors());
app.use(express.json())
// PostgreSQL connection pool
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: 5432, 
    ssl: {
        rejectUnauthorized: false, 
    },
  });


app.use(express.json());
app.use(cors());

// Connect to PostgreSQL database
pool.connect()
    .then(() => console.log('Connected to PostgreSQL'))
    .catch(error => console.error('Error connecting to PostgreSQL:', error));

    
    app.get('/api/public/movies', async (req, res) => {
        try {
            // Query to fetch all movies from the movies table
            const query = `
    SELECT m.*, COALESCE(CAST(AVG(rating) AS NUMERIC(10, 2)), 0) AS rating
    FROM movies m
    LEFT JOIN movie_ratings r ON m.id = r.movie_id
    GROUP BY m.id
`;

            const result = await pool.query(query);
    
            // Return the list of movies as the response
            const movies = result.rows;
            res.status(200).json({ success: true, movies });
        } catch (error) {
            console.error('Error fetching movies:', error);
            res.status(500).json({ success: false, error: 'Internal Server Error' });
        }
    });

    app.post('/api/movies/:movieId/rating',async (req,res)=>{
        const movieId = req.params.id;
        const {customerId,rating} = req.body;
        try{
            if(!Number.isInteger(rating) || rating<1 || rating >5){
                res.status(500).json({success:false,message:"Provide appropriate rating"})
            }
            const query = `insert into movie_ratings (movie_id,customer_id,rating) values($1,$2,$3) returning *`;
            const result = await pool.query(query,[movieId,customerId,rating]);
            const ratings = rating.rows[0];
            res.status(201).json({success:true,ratings})
        }catch(err){
            res.status(404).json({success:false,message:"unable to provide rating",err})
        }
    })

    const hashpassword = async(password)=>{
        return bcrypt.hash(password,10)
    }
    const comparepassword = async(plainpassword,hashpassword) => {
return bcrypt.compare(plainpassword,hashpassword)
    }

    const generateToken = (userId) => {
        return jwt.sign({userId},process.env.JWT_SECRET,{expiresIn:'1hr'})
    } 

    const verifyToken = (req,res,next) => {
        const token = req.headers['authorization'];
        if(!token){
           return res.status(401).json({success:false,message:"token is not provided"})
        }
        jwt.verify(token,process.env.JWT_SECRET,(err,decoded)=>{
            if(err){
                return res.status(401).json({success:false,err:"Invalid token"})
            }
            req.userId = decoded.userId;
            next()
        })
    }
    app.post('/api/signup',async(req,res)=> {
        try{
            const{username,email,password} =req.body;
            const userExistQuery = `select * from customers where username= $1 or email=$2`;
            const ifexist = await pool.query(userExistQuery,[username,email])
            console.log(ifexist)
if(ifexist.rows.length > 0){
    return res.status(400).json({success:false,message:"username or email already exists"})
}
const newuserQuery = `insert into customers (username,email,password) values($1,$2,$3) returning *`;
const hashedpassword = await hashpassword(password)
const newUsersResult = await pool.query(newuserQuery,[username,email,hashedpassword]);
const newUser = newUsersResult.rows[0];
console.log(newUser)
const token  = generateToken(newUser.id);
res.status(201).json({ success: true, user: newUser, token });
        }catch(err){
            res.status(500).json({ success: false, error: 'Internal Server Error' });
        }
    })

    app.post('/api/login',async(req,res)=>{
try{
    const {usernameOremail,password} = req.body;
    const getUserQuery = `select * from customers where username = $1 or email = $2`;
    const userResult = await pool.query(getUserQuery,[usernameOremail,usernameOremail]);
    const user = userResult.rows[0]
    if(!user){
        return res.status(401).json({success:false,message:"username or email not found"})
    }
const passwordMatch = await comparepassword(password,user.password);
if(!passwordMatch){
    return res.status(401).json({success:false,message:"password didnt match"})
}
const token = await generateToken(user.id);
res.status(201).json({success:true,user,token})
}catch(err){
    res.status(500).json({ success: false, error: 'Internal Server Error' });
}
    })
    app.listen(PORT,()=>{
        console.log(`Server is running on port ${PORT}`)
    })