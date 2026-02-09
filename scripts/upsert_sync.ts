
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const loadEnv = () => {
    try {
        const envPath = path.resolve(process.cwd(), '.env.local');
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const env: Record<string, string> = {};
        envContent.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
            }
        });
        return env;
    } catch (e) { return {}; }
};

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function main() {
    console.log('=== DIRECT SQL APPROACH ===\n');

    const todayStr = new Date().toISOString().split('T')[0];

    // Get product IDs first
    const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .in('name', ['商品A（ハンバーグ弁当）', '商品B（ポテトサラダ）', '商品C（チキン南蛮弁当）']);

    if (!products || products.length === 0) {
        console.error('Products not found');
        return;
    }

    console.log('Found products:', products.map(p => p.name).join(', '));

    // Use RPC to execute raw SQL
    const deleteSQL = `
        DELETE FROM production_logs
        WHERE order_date = '${todayStr}'
        AND product_id IN ('${products.map(p => p.id).join("','")}')
    `;

    console.log('\nDeleting existing logs...');
    const { error: deleteError } = await supabase.rpc('exec_sql', { sql: deleteSQL });

    if (deleteError) {
        console.log('Delete via RPC error (trying direct delete):', delete error.message);

        // Try direct delete
        const { error: directDeleteError } = await supabase
            .from('production_logs')
            .delete()
            .in('product_id', products.map(p => p.id))
            .eq('order_date', todayStr);

        if (directDeleteError) {
            console.error('Direct delete also failed:', directDeleteError.message);
        } else {
            console.log('Direct delete succeeded');
        }
    }

    // Try using upsert instead of insert
    console.log('\nTrying upsert for production logs...');

    const startTime = `${todayStr}T09:00:00`;
    const endTime = `${todayStr}T12:30:00`;

    const logsToUpsert = products.map(product => ({
        product_id: product.id,
        order_date: todayStr,
        status: 'processing',
        start_time: startTime,
        end_time: endTime,
        worker_count: 2
    }));

    const { data: upsertedLogs, error: upsertError } = await supabase
        .from('production_logs')
        .upsert(logsToUpsert, { onConflict: 'product_id,order_date' })
        .select();

    if (upsertError) {
        console.error('Upsert failed:', upsertError);
    } else {
        console.log(`Successfully upserted ${upsertedLogs?.length ?? 0} logs`);
    }

    // Verify
    console.log('\n=== VERIFICATION ===');
    const { data: verifyLogs } = await supabase
        .from('production_logs')
        .select('product_id, start_time, end_time, worker_count')
        .eq('order_date', todayStr);

    console.log(`Production logs count: ${verifyLogs?.length ?? 0}`);
    verifyLogs?.forEach(log => {
        const product = products.find(p => p.id === log.product_id);
        console.log(`  ${product?.name}: ${log.worker_count} workers`);
    });

    const { data: verifyOrders } = await supabase
        .from('orders')
        .select('product_id, actual_quantity, status')
        .eq('order_date', todayStr);

    console.log(`\nOrders count: ${verifyOrders?.length ?? 0}`);
    let totalQty = 0;
    verifyOrders?.forEach(order => {
        const product = products.find(p => p.id === order.product_id);
        totalQty += order.actual_quantity || 0;
        console.log(`  ${product?.name}: ${order.actual_quantity} units, ${order.status}`);
    });

    console.log(`\nTotal: ${totalQty} units, ¥7,700 cost, ¥${(7700 / totalQty).toFixed(2)}/unit`);
}

main().catch(console.error);
