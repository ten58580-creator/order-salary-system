
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
    console.log('==========================================================');
    console.log('CORRECTED TABLE NAME: production_records');
    console.log('==========================================================\n');

    const todayStr = new Date().toISOString().split('T')[0];
    console.log(`Target Date: ${todayStr}\n`);

    // 1. Find all target products
    console.log('STEP 1: Finding products...');
    const { data: products, error: prodError } = await supabase
        .from('products')
        .select('id, name')
        .in('name', [
            '商品A（ハンバーグ弁当）',
            '商品B（ポテトサラダ）',
            '商品C（チキン南蛮弁当）',
            '焼き魚'
        ]);

    if (prodError || !products || products.length === 0) {
        console.error('ERROR finding products:', prodError);
        return;
    }

    console.log(`✓ Found ${products.length} products:`);
    products.forEach(p => console.log(`  - ${p.name} (${p.id})`));
    console.log('');

    const productIds = products.map(p => p.id);

    // 2. Delete existing production_records for today
    console.log('STEP 2: Deleting existing production_records...');
    const { error: deleteError, count: deleteCount } = await supabase
        .from('production_records')
        .delete({ count: 'exact' })
        .in('product_id', productIds)
        .gte('created_at', `${todayStr}T00:00:00`)
        .lte('created_at', `${todayStr}T23:59:59`);

    if (deleteError) {
        console.log('Delete error (may be OK if no existing records):', deleteError.message);
    } else {
        console.log(`✓ Deleted ${deleteCount ?? 0} existing records\n`);
    }

    // 3. Insert new production_records with correct data
    console.log('STEP 3: Creating new production_records...');
    const startTime = `${todayStr}T09:00:00`;
    const endTime = `${todayStr}T12:30:00`;

    const recordsToInsert = products.map(product => ({
        product_id: product.id,
        created_at: startTime,
        start_time: startTime,
        end_time: endTime,
        worker_count: 2,
        status: 'completed'
    }));

    let insertedCount = 0;
    for (const record of recordsToInsert) {
        const product = products.find(p => p.id === record.product_id);
        console.log(`  Inserting record for ${product?.name}...`);

        const { data, error } = await supabase
            .from('production_records')
            .insert(record)
            .select();

        if (error) {
            console.error(`  ✗ ERROR for ${product?.name}:`);
            console.error(`    ${error.message}`);
            console.error(`    Details: ${error.details}`);
            console.error(`    Hint: ${error.hint}`);
        } else {
            insertedCount++;
            console.log(`  ✓ ${product?.name}: 09:00-12:30, 2 workers, completed`);
        }
    }
    console.log(`\n✓ Successfully inserted ${insertedCount}/${products.length} records\n`);

    // 4. Update orders status to completed
    console.log('STEP 4: Updating orders to completed...');
    const { error: updateError, count: updateCount } = await supabase
        .from('orders')
        .update({ status: 'completed' }, { count: 'exact' })
        .in('product_id', productIds)
        .eq('order_date', todayStr);

    if (updateError) {
        console.error('✗ Error updating orders:', updateError.message);
    } else {
        console.log(`✓ Updated ${updateCount ?? 0} orders to completed\n`);
    }

    // 5. Verify final database state
    console.log('==========================================================');
    console.log('VERIFICATION');
    console.log('==========================================================\n');

    const { data: records } = await supabase
        .from('production_records')
        .select('product_id, start_time, end_time, worker_count, status')
        .in('product_id', productIds)
        .gte('created_at', `${todayStr}T00:00:00`);

    console.log(`Production Records (${records?.length ?? 0} records):`);
    records?.forEach(rec => {
        const product = products.find(p => p.id === rec.product_id);
        const start = new Date(rec.start_time);
        const end = new Date(rec.end_time);
        console.log(`  ${product?.name}:`);
        console.log(`    ${start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
        console.log(`    Workers: ${rec.worker_count}, Status: ${rec.status}`);
    });

    const { data: orders } = await supabase
        .from('orders')
        .select('product_id, actual_quantity, status')
        .eq('order_date', todayStr)
        .in('product_id', productIds);

    console.log(`\nOrders (${orders?.length ?? 0} records):`);
    let totalQty = 0;
    orders?.forEach(order => {
        const product = products.find(p => p.id === order.product_id);
        totalQty += order.actual_quantity || 0;
        console.log(`  ${product?.name}: ${order.actual_quantity} units, status: ${order.status}`);
    });

    console.log('\n==========================================================');
    console.log('EXPECTED RESULTS');
    console.log('==========================================================');
    console.log(`Total Labor: 7.0 hours (3.5h × 2 workers)`);
    console.log(`Total Cost: ¥7,700`);
    console.log(`Total Production: ${totalQty} units`);
    console.log(`Average Cost/Unit: ¥${(7700 / totalQty).toFixed(2)}`);
    console.log('==========================================================\n');

    console.log('✓ DATABASE UPDATE COMPLETE');
    console.log(`  - Production Records Inserted: ${insertedCount}`);
    console.log(`  - Orders Updated: ${updateCount ?? 0}`);
}

main().catch(console.error);
