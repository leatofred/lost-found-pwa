// Express server for Lost & Found PWA
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Configuration
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// In-memory storage (replace with database in production)
const storage = {
  users: new Map(),
  items: new Map(),
  messages: new Map(),
  matches: new Map(),
  analytics: new Map(),
  sessions: new Map()
};

// Sample data initialization
initializeSampleData();

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// File upload configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5 // Max 5 files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Static files
app.use(express.static(path.join(__dirname, 'dist')));
app.use('/uploads', express.static(UPLOAD_DIR));

// API Routes

// Authentication routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, organization } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Check if user exists
    const existingUser = Array.from(storage.users.values()).find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userId = generateId();
    const user = {
      id: userId,
      name,
      email,
      password: hashedPassword,
      organization: organization || 'General',
      role: 'user',
      avatar: null,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      preferences: {
        notifications: true,
        emailAlerts: true,
        privacy: 'public'
      }
    };

    storage.users.set(userId, user);

    // Generate tokens
    const token = jwt.sign(
      { userId, email, role: user.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const refreshToken = jwt.sign(
      { userId },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Remove password from response
    const { password: _, ...userResponse } = user;

    res.status(201).json({
      user: userResponse,
      token,
      refreshToken
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = Array.from(storage.users.values()).find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last active
    user.lastActive = new Date().toISOString();
    storage.users.set(user.id, user);

    // Generate tokens
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Remove password from response
    const { password: _, ...userResponse } = user;

    res.json({
      user: userResponse,
      token,
      refreshToken
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    jwt.verify(refreshToken, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid refresh token' });
      }

      const user = storage.users.get(decoded.userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Generate new tokens
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      const newRefreshToken = jwt.sign(
        { userId: user.id },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        token,
        refreshToken: newRefreshToken
      });
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

app.get('/api/auth/profile', authenticateToken, (req, res) => {
  try {
    const user = storage.users.get(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password: _, ...userResponse } = user;
    res.json(userResponse);

  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Items routes
app.get('/api/items', (req, res) => {
  try {
    const { 
      search, 
      category, 
      type, 
      location, 
      page = 1, 
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    let items = Array.from(storage.items.values());

    // Apply filters
    if (search) {
      const searchLower = search.toLowerCase();
      items = items.filter(item => 
        item.title.toLowerCase().includes(searchLower) ||
        item.description.toLowerCase().includes(searchLower)
      );
    }

    if (category) {
      items = items.filter(item => item.category === category);
    }

    if (type) {
      items = items.filter(item => item.type === type);
    }

    if (location) {
      items = items.filter(item => 
        item.location.toLowerCase().includes(location.toLowerCase())
      );
    }

    // Sort items
    items.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      
      if (sortOrder === 'desc') {
        return new Date(bValue) - new Date(aValue);
      } else {
        return new Date(aValue) - new Date(bValue);
      }
    });

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedItems = items.slice(startIndex, endIndex);

    // Add match count to each item
    const itemsWithMatches = paginatedItems.map(item => ({
      ...item,
      matchCount: getMatchCount(item.id)
    }));

    res.json({
      items: itemsWithMatches,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: items.length,
        pages: Math.ceil(items.length / limit)
      }
    });

  } catch (error) {
    console.error('Items fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

app.get('/api/items/recent', (req, res) => {
  try {
    const { limit = 6 } = req.query;
    
    const items = Array.from(storage.items.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, parseInt(limit));

    const itemsWithMatches = items.map(item => ({
      ...item,
      matchCount: getMatchCount(item.id)
    }));

    res.json(itemsWithMatches);

  } catch (error) {
    console.error('Recent items fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch recent items' });
  }
});

app.get('/api/items/:id', (req, res) => {
  try {
    const item = storage.items.get(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const itemWithMatches = {
      ...item,
      matchCount: getMatchCount(item.id),
      matches: getItemMatches(item.id)
    };

    res.json(itemWithMatches);

  } catch (error) {
    console.error('Item fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

app.post('/api/items', authenticateToken, upload.array('images', 5), async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      type,
      location,
      dateOccurred,
      contactInfo,
      isPrivate = false
    } = req.body;

    // Validation
    if (!title || !description || !category || !type || !location) {
      return res.status(400).json({ 
        error: 'Title, description, category, type, and location are required' 
      });
    }

    // Process uploaded images (simplified without sharp)
    const images = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const filename = `${generateId()}.${file.originalname.split('.').pop()}`;
        const filepath = path.join(UPLOAD_DIR, filename);
        
        // Save original file
        require('fs').writeFileSync(filepath, file.buffer);
        images.push(`/uploads/${filename}`);
      }
    }

    // Create item
    const itemId = generateId();
    const item = {
      id: itemId,
      title,
      description,
      category,
      type,
      location,
      dateOccurred: dateOccurred || new Date().toISOString(),
      contactInfo,
      isPrivate: Boolean(isPrivate),
      images,
      userId: req.user.userId,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      views: 0,
      tags: extractTags(title + ' ' + description)
    };

    storage.items.set(itemId, item);

    // Find potential matches using AI
    const matches = await findPotentialMatches(item);
    
    // Notify users of matches
    if (matches.length > 0) {
      notifyMatches(item, matches);
    }

    res.status(201).json(item);

  } catch (error) {
    console.error('Item creation error:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// Dashboard routes
app.get('/api/dashboard/summary', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    
    const userItems = Array.from(storage.items.values())
      .filter(item => item.userId === userId);
    
    const matches = Array.from(storage.matches.values())
      .filter(match => 
        userItems.some(item => item.id === match.lostItemId || item.id === match.foundItemId)
      );
    
    const messages = Array.from(storage.messages.values())
      .filter(msg => msg.recipientId === userId && !msg.read);
    
    const recoveredItems = userItems.filter(item => item.status === 'recovered');

    res.json({
      myItems: userItems.length,
      matches: matches.length,
      unreadMessages: messages.length,
      recoveredItems: recoveredItems.length
    });

  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

// Platform stats
app.get('/api/stats/platform', (req, res) => {
  try {
    const totalUsers = storage.users.size;
    const totalItems = storage.items.size;
    const successfulMatches = Array.from(storage.matches.values())
      .filter(match => match.status === 'confirmed').length;
    
    // Calculate average recovery time
    const recoveredItems = Array.from(storage.items.values())
      .filter(item => item.status === 'recovered');
    
    let avgRecoveryTime = '2.5 days';
    if (recoveredItems.length > 0) {
      const totalDays = recoveredItems.reduce((sum, item) => {
        const created = new Date(item.createdAt);
        const recovered = new Date(item.updatedAt);
        const days = (recovered - created) / (1000 * 60 * 60 * 24);
        return sum + days;
      }, 0);
      
      const avgDays = totalDays / recoveredItems.length;
      avgRecoveryTime = `${avgDays.toFixed(1)} days`;
    }

    res.json({
      totalUsers,
      totalItems,
      successfulMatches,
      avgRecoveryTime
    });

  } catch (error) {
    console.error('Platform stats error:', error);
    res.status(500).json({ error: 'Failed to fetch platform stats' });
  }
});

// Analytics routes
app.post('/api/analytics/events', authenticateToken, (req, res) => {
  try {
    const { events, sessionId, batchId } = req.body;
    
    // Store analytics events
    const analyticsEntry = {
      id: batchId,
      userId: req.user.userId,
      sessionId,
      events,
      timestamp: new Date().toISOString()
    };
    
    storage.analytics.set(batchId, analyticsEntry);
    
    // Process cost analytics
    events.forEach(event => {
      if (event.name === 'cost_event') {
        processCostEvent(event.properties);
      }
    });

    res.json({ success: true, processed: events.length });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to process analytics' });
  }
});

// Socket.IO for real-time features
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  socket.on('leave_room', (roomId) => {
    socket.leave(roomId);
    console.log(`User ${socket.id} left room ${roomId}`);
  });

  socket.on('send_message', (data) => {
    // Handle real-time messaging
    const message = {
      id: generateId(),
      ...data,
      timestamp: new Date().toISOString()
    };
    
    storage.messages.set(message.id, message);
    
    // Emit to recipient
    socket.to(data.recipientId).emit('new_message', message);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Serve PWA for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files' });
    }
  }
  
  res.status(500).json({ error: 'Internal server error' });
});

// Utility functions
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function extractTags(text) {
  // Simple tag extraction
  const words = text.toLowerCase().split(/\s+/);
  return words.filter(word => word.length > 3).slice(0, 10);
}

function getMatchCount(itemId) {
  return Array.from(storage.matches.values())
    .filter(match => match.lostItemId === itemId || match.foundItemId === itemId)
    .length;
}

function getItemMatches(itemId) {
  return Array.from(storage.matches.values())
    .filter(match => match.lostItemId === itemId || match.foundItemId === itemId)
    .slice(0, 5); // Return top 5 matches
}

async function findPotentialMatches(item) {
  // Simple AI matching algorithm
  const oppositeType = item.type === 'lost' ? 'found' : 'lost';
  const potentialMatches = Array.from(storage.items.values())
    .filter(otherItem => 
      otherItem.type === oppositeType &&
      otherItem.category === item.category &&
      otherItem.status === 'active'
    );

  const matches = [];
  
  for (const match of potentialMatches) {
    const confidence = calculateMatchConfidence(item, match);
    if (confidence > 0.6) { // 60% confidence threshold
      const matchId = generateId();
      const matchRecord = {
        id: matchId,
        lostItemId: item.type === 'lost' ? item.id : match.id,
        foundItemId: item.type === 'found' ? item.id : match.id,
        confidence,
        status: 'pending',
        createdAt: new Date().toISOString(),
        method: 'ai'
      };
      
      storage.matches.set(matchId, matchRecord);
      matches.push(matchRecord);
    }
  }
  
  return matches;
}

function calculateMatchConfidence(item1, item2) {
  let confidence = 0;
  
  // Category match (base score)
  if (item1.category === item2.category) {
    confidence += 0.3;
  }
  
  // Title similarity
  const titleSimilarity = calculateTextSimilarity(item1.title, item2.title);
  confidence += titleSimilarity * 0.4;
  
  // Description similarity
  const descSimilarity = calculateTextSimilarity(item1.description, item2.description);
  confidence += descSimilarity * 0.2;
  
  // Location proximity
  const locationSimilarity = calculateTextSimilarity(item1.location, item2.location);
  confidence += locationSimilarity * 0.1;
  
  return Math.min(confidence, 1.0);
}

function calculateTextSimilarity(text1, text2) {
  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);
  
  const intersection = words1.filter(word => words2.includes(word));
  const union = [...new Set([...words1, ...words2])];
  
  return intersection.length / union.length;
}

function notifyMatches(item, matches) {
  // Emit real-time notifications
  matches.forEach(match => {
    const targetItemId = match.lostItemId === item.id ? match.foundItemId : match.lostItemId;
    const targetItem = storage.items.get(targetItemId);
    
    if (targetItem) {
      io.to(targetItem.userId).emit('new_match', {
        match,
        item: item,
        targetItem: targetItem
      });
    }
  });
}

function processCostEvent(eventData) {
  // Process cost analytics for real-time monitoring
  console.log('Processing cost event:', eventData);
  
  // Here you would implement cost tracking logic
  // This could integrate with cloud provider APIs for real cost data
}

function initializeSampleData() {
  // Create sample admin user
  const adminId = generateId();
  const adminUser = {
    id: adminId,
    name: 'Admin User',
    email: 'admin@lostfound.com',
    password: bcrypt.hashSync('admin123', 10),
    organization: 'System',
    role: 'admin',
    avatar: null,
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    preferences: {
      notifications: true,
      emailAlerts: true,
      privacy: 'public'
    }
  };
  
  storage.users.set(adminId, adminUser);
  
  // Create sample items
  const sampleItems = [
    {
      id: generateId(),
      title: 'iPhone 13 Pro',
      description: 'Black iPhone 13 Pro with cracked screen protector',
      category: 'electronics',
      type: 'lost',
      location: 'University Library, 2nd Floor',
      dateOccurred: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      contactInfo: 'john@university.edu',
      isPrivate: false,
      images: [],
      userId: adminId,
      status: 'active',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      views: 15,
      tags: ['iphone', 'phone', 'black', 'cracked']
    },
    {
      id: generateId(),
      title: 'Blue Backpack',
      description: 'Navy blue Jansport backpack with laptop compartment',
      category: 'bags',
      type: 'found',
      location: 'Student Center Cafeteria',
      dateOccurred: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      contactInfo: 'security@university.edu',
      isPrivate: false,
      images: [],
      userId: adminId,
      status: 'active',
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      views: 8,
      tags: ['backpack', 'blue', 'jansport', 'laptop']
    }
  ];
  
  sampleItems.forEach(item => {
    storage.items.set(item.id, item);
  });
  
  console.log('Sample data initialized');
}

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Lost & Found PWA server running on port ${PORT}`);
  console.log(`📱 Access the app at http://localhost:${PORT}`);
  console.log(`👤 Admin login: admin@lostfound.com / admin123`);
});

module.exports = { app, server, io };