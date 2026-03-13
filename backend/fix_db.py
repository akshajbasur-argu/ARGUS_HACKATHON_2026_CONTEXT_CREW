import asyncio
import asyncpg

async def run():
    conn = await asyncpg.connect('postgresql://grantflow:grantflow@localhost:5434/grantflow')
    await conn.execute('DROP SCHEMA public CASCADE;')
    await conn.execute('CREATE SCHEMA public;')
    await conn.execute('GRANT ALL ON SCHEMA public TO grantflow;')
    await conn.execute('GRANT ALL ON SCHEMA public TO public;')
    
    # Also drop enum types that might have been created outside the schema or left behind
    types = ["user_role", "org_type", "application_status", "screening_outcome", "disbursement_trigger", "disbursement_status", "report_type", "report_status", "content_rating"]
    for t in types:
        try:
            await conn.execute(f'DROP TYPE IF EXISTS {t} CASCADE;')
        except Exception as e:
            pass
            
    await conn.close()
    print("Database wiped successfully!")

asyncio.run(run())
