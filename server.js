const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 4001;
const cors = require('cors');

app.use(cors());
app.use(express.json());

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

// Connect to PostgreSQL database
pool.connect()
    .then(() => console.log('Connected to PostgreSQL'))
    .catch(error => console.error('Error connecting to PostgreSQL:', error));

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: "Token is not provided" });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ success: false, err: "Invalid token" });
        }

        req.userId = decoded.userId;
        console.log(decoded)
        next();
    });
};

// Get all movies with average ratings
app.get('/api/public/movies', async (req, res) => {
    try {
        const query = `
        SELECT m.*, COALESCE(CAST(AVG(r.rating) AS NUMERIC(10, 2)), 0) AS rating
        FROM movies m
        LEFT JOIN movie_ratings r ON m.id = r.movie_id
        GROUP BY m.id
    `;
        const result = await pool.query(query);
        const movies = result.rows;
        res.status(200).json({ success: true, movies });
    } catch (error) {
        console.error('Error fetching movies:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// Add or update movie rating
// app.post('/api/movies/:movieId/rating', verifyToken, async (req, res) => {
//     try {
//         const { movieId } = req.params;
//         const { rating } = req.body;
//         const userId = req.userId;

//         // Check if the rating is a valid number
//         if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
//             return res.status(400).json({ success: false, error: 'Invalid rating. Rating must be an integer between 1 and 5.' });
//         }

//         // Check if the user has already rated the movie
//         const existingRatingQuery = 'SELECT * FROM movie_ratings WHERE movie_id = $1 AND customer_id = $2';
//         const existingRatingResult = await pool.query(existingRatingQuery, [movieId, userId]);

//         if (existingRatingResult.rows.length > 0) {
//             // User has already rated the movie, update the existing rating
//             const updateRatingQuery = 'UPDATE movie_ratings SET rating = $1 WHERE movie_id = $2 AND customer_id = $3 RETURNING *';
//             const updateRatingResult = await pool.query(updateRatingQuery, [rating, movieId, userId]);
//             const updatedRating = updateRatingResult.rows[0];
//             return res.status(200).json({ success: true, rating: updatedRating });
//         }

//         // Insert a new rating into the movie_ratings table
//         const insertRatingQuery = 'INSERT INTO movie_ratings (movie_id, customer_id, rating) VALUES ($1, $2, $3) RETURNING *';
//         const insertRatingResult = await pool.query(insertRatingQuery, [movieId, userId, rating]);
//         const newRating = insertRatingResult.rows[0];
//         res.status(201).json({ success: true, rating: newRating });
//     } catch (error) {
//         console.error('Error adding or updating rating:', error);
//         res.status(500).json({ success: false, error: 'Internal Server Error' });
//     }
// });
app.post('/api/movies/:movieId/rating', verifyToken, async (req, res) => {
    try {
        const { movieId } = req.params;
        const { rating } = req.body;
        const userId = req.userId;

        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, error: 'Invalid rating. Rating must be an integer between 1 and 5.' });
        }

        const existingRatingQuery = 'SELECT * FROM movie_ratings WHERE movie_id = $1 AND customer_id = $2';
        const existingRatingResult = await pool.query(existingRatingQuery, [movieId, userId]);

        if (existingRatingResult.rows.length > 0) {
            const updateRatingQuery = 'UPDATE movie_ratings SET rating = $1 WHERE movie_id = $2 AND customer_id = $3 RETURNING *';
            const updateRatingResult = await pool.query(updateRatingQuery, [rating, movieId, userId]);
            const updatedRating = updateRatingResult.rows[0];
            return res.status(200).json({ success: true, rating: updatedRating });
        }

        const insertRatingQuery = 'INSERT INTO movie_ratings (movie_id, customer_id, rating) VALUES ($1, $2, $3) RETURNING *';
        const insertRatingResult = await pool.query(insertRatingQuery, [movieId, userId, rating]);
        const newRating = insertRatingResult.rows[0];
        res.status(201).json({ success: true, rating: newRating });
    } catch (error) {
        console.error('Error adding or updating rating:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// Sign up route
app.post('/api/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const userExistQuery = 'SELECT * FROM customers WHERE username = $1 OR email = $2';
        const userExists = await pool.query(userExistQuery, [username, email]);

        if (userExists.rows.length > 0) {
            return res.status(400).json({ success: false, message: "Username or email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUserQuery = 'INSERT INTO customers (username, email, password) VALUES ($1, $2, $3) RETURNING *';
        const newUserResult = await pool.query(newUserQuery, [username, email, hashedPassword]);
        const newUser = newUserResult.rows[0];
        const token = jwt.sign({ userId: newUser.id }, process.env.JWT_SECRET, { expiresIn: '1hr' });
        res.status(201).json({ success: true, user: newUser, token });
    } catch (error) {
        console.error('Error signing up:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// Login route
app.post('/api/login', async (req, res) => {
    try {
        const { usernameOremail, password } = req.body;
        const getUserQuery = 'SELECT * FROM customers WHERE username = $1 OR email = $2';
        const userResult = await pool.query(getUserQuery, [usernameOremail, usernameOremail]);
        const user = userResult.rows[0];

        if (!user) {
            return res.status(401).json({ success: false, message: "Username or email not found" });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ success: false, message: "Password doesn't match" });
        }

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1hr' });
        res.status(201).json({ success: true, user, token });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});
app.get('/api/user/:userId/ratings', verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;

        // Fetch user ratings from the database based on the userId
        const query = 'SELECT movie_id, rating FROM movie_ratings WHERE customer_id = $1';
        const result = await pool.query(query, [userId]);

        // Convert the result into an object where movie_id is the key and rating is the value
        const userRatings = {};
        result.rows.forEach((row) => {
            userRatings[row.movie_id] = row.rating;
        });
console.log(userRatings)
        res.status(200).json({ success: true, ratings: userRatings });
    } catch (error) {
        console.error('Error fetching user ratings:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});
// Get user ratings
// app.get('/api/user/:userId/ratings', verifyToken, async (req, res) => {
//     try {
//         const { userId } = req.params;
//         const query = 'SELECT movie_id, rating FROM movie_ratings WHERE customer_id = $1';
//         const result = await pool.query(query, [userId]);
//         const userRatings = {};
//         result.rows.forEach((row) => {
//             userRatings[row.movie_id] = row.rating;
//         });
//         res.status(200).json({ success: true, ratings: userRatings });
//     } catch (error) {
//         console.error('Error fetching user ratings:', error);
//         res.status(500).json({ success: false, error: 'Internal Server Error' });
//     }
// });
app.get('/api/public/movies/:movieId',async(req,res)=>{
    try{
        const movieId = req.params?.id;
        if(!movieId){
            return res.status(401).json({success:false,err:"movie id is missing"})
        }
        const query = `select m.*, coalesce(cast(avg(r.rating) as numeric(10,2)),0) as rating from movies m left join movie_ratings r on m.id = r.movie_id where m.id = $1 group by m.id;`
        const result = await pool.query(query,[movieId])
        if(result.rows.length === 0){
            return res.status(401).json({success:false,err:"movie not found"})
        }
        const movie = result.rows[0]
        res.status(201).json({success:trur,movie})
    }catch (error) {
        console.error('Error fetching movie:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }


})
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
