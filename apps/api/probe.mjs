import { Pool } from 'pg';
const p = new Pool({ connectionString: 'postgresql://garageos:garageos_dev@localhost:5433/garageos' });
console.log((await p.query(`
  select wa.id, wa.status::text, ql.line_type::text, ql.service_item_id, ql.description, si.code
    from work_assignment wa
    join quotation_line ql on ql.id = wa.quotation_line_id
    left join service_item si on si.id = ql.service_item_id`)).rows);
await p.end();
