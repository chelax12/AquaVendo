import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function fetchAllDataForUnit(unitId: string) {
  const [machineRes, historyRes] = await Promise.all([
    supabase.from('machine_state').select('*').eq('unit_id', unitId).maybeSingle(),
    supabase.from('collection_history').select('*').eq('unit_id', unitId).order('collected_at', { ascending: false })
  ]);

  if (machineRes.error) throw machineRes.error;

  const state = {
    coins: {
      p1: machineRes.data?.p1_count || 0,
      p5: machineRes.data?.p5_count || 0,
      p10: machineRes.data?.p10_count || 0
    },
    waterLevel: machineRes.data?.water_level || 0,
    systemAlerts: machineRes.data?.system_status || 'Operational',
    lastUpdated: new Date(machineRes.data?.updated_at || new Date()).toLocaleTimeString(),
    history: (historyRes.data || []).map((item: any) => ({
      id: item.id,
      date: new Date(item.collected_at).toLocaleString(),
      p1: item.p1_collected,
      p5: item.p5_collected,
      p10: item.p10_collected,
      total: Number(item.total_amount)
    }))
  };

  return state;
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    }
  });

  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  io.on('connection', async (socket) => {
    console.log('A client connected:', socket.id);

    socket.on('requestInitialData', async (unitId) => {
      try {
        const data = await fetchAllDataForUnit(unitId);
        socket.emit('initialData', data);
      } catch (error) {
        console.error('Error fetching initial data:', error);
        socket.emit('dataError', 'Failed to fetch initial data.');
      }
    });

    socket.on('disconnect', () => {
      console.log('A client disconnected:', socket.id);
    });
  });

  const channel = supabase.channel('realtime-updates')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'machine_state' },
      async (payload) => {
        const unitId = (payload.new as any).unit_id;
        if (unitId) {
          const data = await fetchAllDataForUnit(unitId);
          io.emit('update', { unitId, data });
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'collection_history' },
      async (payload) => {
        const unitId = (payload.new as any).unit_id;
        if (unitId) {
          const data = await fetchAllDataForUnit(unitId);
          io.emit('update', { unitId, data });
        }
      }
    )
    .subscribe();

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is listening on http://localhost:${PORT}`);
  });
}

startServer();