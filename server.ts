import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { MongoClient, ObjectId } from 'mongodb';

dotenv.config();

async function startServer() {
  const app = express();
 const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

  app.use(express.json());

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', name: 'SchemaForge Engine' });
  });

  // MongoDB Connect & Get Databases
  app.post('/api/mongodb/databases', async (req, res) => {
    try {
      const { uri } = req.body;
      if (!uri) return res.status(400).json({ error: 'MongoDB URI is required' });
      
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
      await client.connect();
      const adminDb = client.db('admin');
      const dbs = await adminDb.admin().listDatabases();
      await client.close();
      
      res.json({ success: true, databases: dbs.databases.map(d => d.name) });
    } catch (err: any) {
      console.error('Error connecting to MongoDB:', err);
      res.status(500).json({ error: err.message || 'Failed to connect to MongoDB' });
    }
  });

  // MongoDB Get Collections
  app.post('/api/mongodb/collections', async (req, res) => {
    try {
      const { uri, dbName } = req.body;
      if (!uri || !dbName) return res.status(400).json({ error: 'URI and Database Name are required' });
      
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
      await client.connect();
      const db = client.db(dbName);
      const collections = await db.listCollections().toArray();
      await client.close();
      
      res.json({ success: true, collections: collections.map(c => c.name) });
    } catch (err: any) {
      console.error('Error fetching collections:', err);
      res.status(500).json({ error: err.message || 'Failed to fetch collections' });
    }
  });

  // MongoDB Import Schema
  app.post('/api/mongodb/import', async (req, res) => {
    try {
      const { uri, dbName, collectionNames } = req.body;
      if (!uri || !dbName || !collectionNames || !Array.isArray(collectionNames)) {
        return res.status(400).json({ error: 'Invalid request payload' });
      }

      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
      await client.connect();
      const db = client.db(dbName);

      const generatedCollections = [];
      let xOffset = 50;
      let yOffset = 100;

      for (const colName of collectionNames) {
        const collection = db.collection(colName);
        const sampleDocs = await collection.find().limit(50).toArray();
        
        const fieldsMap = new Map<string, any>();
        
        // Infer fields from sample documents
        sampleDocs.forEach(doc => {
          Object.keys(doc).forEach(key => {
            if (!fieldsMap.has(key)) {
              const val = doc[key];
              let type = 'String';
              let isForeignKey = false;
              let targetCollectionId = undefined;
              let targetFieldId = undefined;

              if (val instanceof ObjectId) {
                type = 'ObjectId';
                // Very naive relationship detection
                if (key !== '_id' && (key.toLowerCase().endsWith('id') || key.toLowerCase().endsWith('_id'))) {
                  isForeignKey = true;
                  // Try to guess target collection
                  let baseName = key.replace(/id$/i, '').replace(/_$/, '');
                  // We'll leave target empty and let user link or try to map if collections match
                }
              } else if (typeof val === 'number') {
                type = 'Number';
              } else if (typeof val === 'boolean') {
                type = 'Boolean';
              } else if (val instanceof Date) {
                type = 'Date';
              } else if (Array.isArray(val)) {
                type = 'Array';
              } else if (typeof val === 'object' && val !== null) {
                type = 'JSON';
              }

              fieldsMap.set(key, {
                id: `f_${colName}_${key}`,
                name: key,
                type,
                isPrimaryKey: key === '_id',
                isForeignKey,
                validation: { required: false }
              });
            }
          });
        });

        // Add _id if it was completely empty collection
        if (sampleDocs.length === 0) {
          fieldsMap.set('_id', {
            id: `f_${colName}__id`,
            name: '_id',
            type: 'ObjectId',
            isPrimaryKey: true,
            isForeignKey: false,
            validation: { required: true }
          });
        }

        generatedCollections.push({
          id: `col_${colName}`,
          name: colName,
          icon: 'Database', // Default icon
          colorTag: '#afc6ff',
          position: { x: xOffset, y: yOffset },
          fields: Array.from(fieldsMap.values())
        });

        xOffset += 400;
        if (xOffset > 1200) {
          xOffset = 50;
          yOffset += 350;
        }
      }

      await client.close();

      // Post-process to link foreign keys if target collection exists
      generatedCollections.forEach(col => {
        col.fields.forEach(field => {
          if (field.isForeignKey) {
            let possibleTarget = field.name.replace(/id$/i, '').replace(/_$/, '').toLowerCase();
            if (possibleTarget === 'user') possibleTarget = 'users'; // common pluralization
            else if (!possibleTarget.endsWith('s')) possibleTarget += 's';

            const targetCol = generatedCollections.find(c => c.name.toLowerCase() === possibleTarget);
            if (targetCol) {
              const targetPk = targetCol.fields.find(f => f.isPrimaryKey);
              if (targetPk) {
                field.foreignKeyRef = {
                  targetCollectionId: targetCol.id,
                  targetFieldId: targetPk.id
                };
              }
            }
          }
        });
      });

      res.json({ success: true, collections: generatedCollections });
    } catch (err: any) {
      console.error('Error importing collections:', err);
      res.status(500).json({ error: err.message || 'Failed to import collections' });
    }
  });

  // AI Schema Generator route using server-side Gemini API
  app.post('/api/generate-schema', async (req, res) => {
    try {
      const { prompt, framework = 'mongoose' } = req.body;

      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Prompt string is required.' });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: 'GEMINI_API_KEY environment variable is missing.' });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: `You are an expert database architect and ORM specialist.
Generate a complete database schema based on this user request: "${prompt}".
Target Framework: ${framework}.

You MUST return a JSON object with this exact structure:
{
  "collections": [
    {
      "id": "col_1",
      "name": "Users",
      "icon": "Users",
      "colorTag": "#afc6ff",
      "position": { "x": 60, "y": 100 },
      "fields": [
        {
          "id": "f_1",
          "name": "_id",
          "type": "ObjectId",
          "isPrimaryKey": true,
          "validation": { "required": true }
        },
        {
          "id": "f_2",
          "name": "email",
          "type": "String",
          "validation": { "required": true, "unique": true, "match": "/^\\\\S+@\\\\S+\\\\.\\\\S+$/" }
        },
        {
          "id": "f_3",
          "name": "username",
          "type": "String",
          "validation": { "required": true }
        },
        {
          "id": "f_4",
          "name": "createdAt",
          "type": "Date",
          "validation": { "defaultVal": "Date.now" }
        }
      ]
    }
  ]
}

Ensure to include primary keys (_id or id) for every table/collection, proper data types (String, Number, Date, Boolean, ObjectId, Array, JSON, Decimal, UUID), validation rules, and foreign key relations if applicable (with targetCollectionId and targetFieldId references).
Make positioning pleasant on canvas by staggering x and y coordinates (e.g. col 1 at x:60, y:100; col 2 at x:480, y:300; col 3 at x:900, y:100).`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              collections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    icon: { type: Type.STRING },
                    colorTag: { type: Type.STRING },
                    position: {
                      type: Type.OBJECT,
                      properties: {
                        x: { type: Type.NUMBER },
                        y: { type: Type.NUMBER },
                      },
                      required: ['x', 'y'],
                    },
                    fields: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          id: { type: Type.STRING },
                          name: { type: Type.STRING },
                          type: { type: Type.STRING },
                          isPrimaryKey: { type: Type.BOOLEAN },
                          isForeignKey: { type: Type.BOOLEAN },
                          foreignKeyRef: {
                            type: Type.OBJECT,
                            properties: {
                              targetCollectionId: { type: Type.STRING },
                              targetFieldId: { type: Type.STRING },
                            },
                          },
                          validation: {
                            type: Type.OBJECT,
                            properties: {
                              required: { type: Type.BOOLEAN },
                              unique: { type: Type.BOOLEAN },
                              match: { type: Type.STRING },
                              defaultVal: { type: Type.STRING },
                            },
                          },
                        },
                        required: ['id', 'name', 'type', 'validation'],
                      },
                    },
                  },
                  required: ['id', 'name', 'position', 'fields'],
                },
              },
            },
            required: ['collections'],
          },
        },
      });

      const jsonText = response.text || '{}';
      const parsedData = JSON.parse(jsonText);

      res.json({ success: true, data: parsedData });
    } catch (err: any) {
      console.error('Error generating schema:', err);
      res.status(500).json({ error: err.message || 'Failed to generate schema' });
    }
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SchemaForge server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
