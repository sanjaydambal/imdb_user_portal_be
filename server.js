const express = require('express');
const { Pool } = require('pg');
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
            const query = 'SELECT * FROM movies';
            const result = await pool.query(query);
    
            // Return the list of movies as the response
            const movies = result.rows;
            res.status(200).json({ success: true, movies });
        } catch (error) {
            console.error('Error fetching movies:', error);
            res.status(500).json({ success: false, error: 'Internal Server Error' });
        }
    });

    app.listen(PORT,()=>{
        console.log(`Server is running on port ${PORT}`)
    })