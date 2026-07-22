import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', name: 'SchemaForge Engine' });
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
