// server.js - Backend API for Gallery Management
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration for production
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors());
app.use(express.json());
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'public/images/gallery');
const dbPath = path.join(__dirname, 'data/gallery.json');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

// Initialize database file if it doesn't exist
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify([]));
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'gallery-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG and WEBP are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Helper functions to read/write gallery data
const readGalleryData = () => {
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading gallery data:', error);
    return [];
  }
};

const writeGalleryData = (data) => {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing gallery data:', error);
    return false;
  }
};

// API Routes

// GET all gallery images
app.get('/api/gallery', (req, res) => {
  try {
    const images = readGalleryData();
    res.json({
      success: true,
      data: images
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gallery images',
      error: error.message
    });
  }
});

// GET images by category
app.get('/api/gallery/category/:category', (req, res) => {
  try {
    const { category } = req.params;
    const images = readGalleryData();
    const filteredImages = category === 'all' 
      ? images 
      : images.filter(img => img.category === category);
    
    res.json({
      success: true,
      data: filteredImages
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch images',
      error: error.message
    });
  }
});

// POST upload new image
app.post('/api/gallery/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const { alt, category } = req.body;

    if (!alt || !category) {
      // Delete uploaded file if validation fails
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Alt text and category are required'
      });
    }

    // Create image entry
    const newImage = {
      id: Date.now().toString(),
      src: `/images/gallery/${req.file.filename}`,
      alt: alt,
      category: category,
      createdAt: new Date().toISOString()
    };

    // Add to database
    const images = readGalleryData();
    images.unshift(newImage);
    
    if (!writeGalleryData(images)) {
      // Delete uploaded file if database write fails
      fs.unlinkSync(req.file.path);
      return res.status(500).json({
        success: false,
        message: 'Failed to save image data'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Image uploaded successfully',
      data: newImage
    });

  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message
    });
  }
});

// DELETE image
app.delete('/api/gallery/:id', (req, res) => {
  try {
    const { id } = req.params;
    const images = readGalleryData();
    
    // Find image to delete
    const imageToDelete = images.find(img => img.id === id);
    
    if (!imageToDelete) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }

    // Delete physical file
    const filePath = path.join(__dirname, 'public', imageToDelete.src);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Remove from database
    const updatedImages = images.filter(img => img.id !== id);
    
    if (!writeGalleryData(updatedImages)) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update database'
      });
    }

    res.json({
      success: true,
      message: 'Image deleted successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete image',
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB'
      });
    }
  }
  
  res.status(500).json({
    success: false,
    message: error.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Gallery API server running on port ${PORT}`);
  console.log(`Image uploads directory: ${uploadsDir}`);
  console.log(`Database file: ${dbPath}`);
});