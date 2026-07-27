const BATCH_SIZE = 200; // process 200 DSA rows at a time

async function runValidation(month, validationRunId) {
  // 1. Count total DSA rows for this month
  const totalDsa = await prisma.dsa_data.count({ where: { month } });
  let offset = 0;

  while (offset < totalDsa) {
    // 2. Fetch a batch of DSA rows
    const dsaBatch = await prisma.dsa_data.findMany({
      where: { month },
      skip: offset,
      take: BATCH_SIZE,
      select: { id: true, app_no: true, customer_name: true, month: true }
    });

    // 3. Extract app_nos for this batch
    const appNos = dsaBatch.map(r => r.app_no);

    // 4. Bulk lookup in admin_data by app_no (index hit — fast)
    const adminByAppNo = await prisma.admin_data.findMany({
      where: { app_no: { in: appNos }, month },
      select: { id: true, app_no: true, customer_name: true }
    });
    const adminAppNoMap = Object.fromEntries(adminByAppNo.map(a => [a.app_no, a]));

    const matched = [];
    const needsNameCheck = [];

    for (const dsa of dsaBatch) {
      if (adminAppNoMap[dsa.app_no]) {
        matched.push({
          admin_data_id: adminAppNoMap[dsa.app_no].id,
          dsa_data_id: dsa.id,
          app_no: dsa.app_no,
          customer_name: dsa.customer_name,
          match_type: 'APP_NO',
          month,
          validation_run_id: validationRunId
        });
      } else {
        needsNameCheck.push(dsa); // fallback to name match
      }
    }

    // 5. Name-based fallback (only for unmatched rows in this batch)
    if (needsNameCheck.length > 0) {
      const names = needsNameCheck.map(r => r.customer_name);
      const adminByName = await prisma.admin_data.findMany({
        where: { customer_name: { in: names }, month },
        select: { id: true, app_no: true, customer_name: true }
      });
      const adminNameMap = Object.fromEntries(adminByName.map(a => [a.customer_name.toUpperCase(), a]));

      for (const dsa of needsNameCheck) {
        const adminMatch = adminNameMap[dsa.customer_name.toUpperCase()];
        if (adminMatch) {
          matched.push({
            admin_data_id: adminMatch.id,
            dsa_data_id: dsa.id,
            app_no: dsa.app_no,
            customer_name: dsa.customer_name,
            match_type: 'CUSTOMER_NAME',
            month,
            validation_run_id: validationRunId
          });
        } else {
          // Flag as unmatched
          await prisma.unmatched_data.create({
            data: {
              source: 'DSA',
              source_row_id: dsa.id,
              app_no: dsa.app_no,
              customer_name: dsa.customer_name,
              month,
              reason: 'No match on APP_NO or CUSTOMER_NAME',
              validation_run_id: validationRunId
            }
          });
        }
      }
    }

    // 6. Bulk insert matched rows
    if (matched.length > 0) {
      await prisma.validated_data.createMany({ data: matched });
    }

    offset += BATCH_SIZE;

    // Optional: small delay to avoid overwhelming DB in peak load
    await new Promise(res => setTimeout(res, 50));
  }
}