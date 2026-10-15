import { describe, expect, it } from 'vitest';
import { capabilities, capabilitiesInto, createBody, emptyCapabilities } from '../src/game/entities';
import { bodyGravity, bodyGravityInto, emptyField } from '../src/physics/gravity';
import { fieldAcceleration, fieldAccelerationInto } from '../src/physics/fields';
import { integrate } from '../src/physics/world';
import { SpatialIndex } from '../src/world/spatial-index';
import { circleBounds, intersects, sweptBounds } from '../src/world/geometry';

/** The physics step reuses buffers instead of allocating per body per step. These pin
 * the in-place forms to the allocating originals they replaced. trajectory.test.ts only
 * proves prediction matches live integration -- it would stay green if both drifted
 * away from the pre-buffer arithmetic together, which is exactly what these catch. */
describe('reused hot-path buffers',()=>{
  it('resolves capabilities in place exactly like the allocating form',()=>{
    const out=emptyCapabilities();
    const bodies=[
      createBody({id:'plain',kind:'asteroid',radius:20,position:{x:0,y:0}}),
      createBody({id:'background',kind:'star',radius:1000,position:{x:0,y:0},layer:'background'}),
      createBody({id:'overridden',kind:'planet',radius:65,position:{x:0,y:0},motion:'kinematic',emitsGravity:false,collision:'capture',density:7}),
      createBody({id:'hole',kind:'black_hole',radius:65,position:{x:0,y:0}}),
      createBody({id:'station',kind:'station',radius:60,position:{x:0,y:0}}),
    ];
    for(const body of bodies)expect(capabilitiesInto(out,body)).toEqual(capabilities(body));
  });
  it('fills a gravity field in place exactly like the allocating form',()=>{
    const field=emptyField();
    const bodies=[
      createBody({id:'rock',kind:'asteroid',radius:18,position:{x:0,y:0}}),
      createBody({id:'planet',kind:'planet',radius:65,position:{x:0,y:0}}),
      createBody({id:'hole',kind:'black_hole',radius:65,position:{x:0,y:0}}),
      createBody({id:'capped',kind:'star',radius:200,position:{x:0,y:0},gravityRadius:5000}),
    ];
    for(const body of bodies)expect(bodyGravityInto(field,body)).toEqual(bodyGravity(body));
  });
  it('resolves a field acceleration in place exactly like the allocating form',()=>{
    const out={x:0,y:0};
    const target={x:40,y:-15};
    const fields=[
      emptyField(),
      {radius:330,strength:110_000,softening:85,maxAcceleration:170,polarity:1 as const},
      {radius:140,strength:5_000,softening:24,maxAcceleration:170,polarity:-1 as const},
    ];
    // Distances chosen to cover every branch: outside the radius, inside 1e-8, inside the
    // softening well, and a plain mid-range point whose magnitude is well under the cap.
    const sources=[{x:0,y:0},{x:40,y:-15},{x:40.0000001,y:-15},{x:40,y:80},{x:40,y:900},{x:-3000,y:-15}];
    for(const field of fields)for(const source of sources){
      expect(fieldAccelerationInto(out,target,source,field)).toBe(out);
      expect(out).toEqual(fieldAcceleration(target,source,field));
    }
  });
  it('saturates in place at maxAcceleration exactly like the allocating form',()=>{
    // Close in, the raw magnitude overshoots the cap; the Math.min has to be in the same
    // place on both paths or a deep well differs by the whole excess.
    const out={x:0,y:0};
    const target={x:0,y:0},source={x:30,y:0};
    const field={radius:330,strength:4e6,softening:24,maxAcceleration:170,polarity:1 as const};
    expect(fieldAcceleration(target,source,field).x).toBe(170);
    fieldAccelerationInto(out,target,source,field);
    expect(out.x).toBe(170);
    expect(out).toEqual(fieldAcceleration(target,source,field));
  });
  it('does not carry one step acceleration into a body that stops being affected',()=>{
    const sun=createBody({id:'sun',kind:'star',radius:65,position:{x:0,y:0}});
    const ship=createBody({id:'ship',kind:'ship',radius:10,position:{x:200,y:0}});
    integrate([sun,ship],[],1/60);
    expect(ship.velocity.x).toBeLessThan(0);
    ship.affectedByFields=false; ship.velocity={x:0,y:0};
    integrate([sun,ship],[],1/60);
    expect(ship.velocity).toEqual({x:0,y:0});
  });
});
describe('precomputed body fields match recomputing them every step',()=>{
  // A forecast hands integrate() one {caps, gravity} for all 720 steps. Those are pure
  // functions of fields that never move during a forecast, but "never move" is an
  // assumption -- these pin the arithmetic, and trajectory.test.ts:14-23 independently
  // pins the end-to-end result, because it drives stepGame with no precompute and
  // compares against predictTrajectory, which now precomputes.
  const build=()=>[
    createBody({id:'sun',kind:'star',radius:65,position:{x:0,y:0},velocity:{x:0,y:0},collision:'none'}),
    createBody({id:'ship',kind:'ship',radius:10,position:{x:260,y:-40},velocity:{x:12,y:5},collision:'none'}),
    createBody({id:'rock',kind:'asteroid',radius:18,position:{x:-180,y:150},velocity:{x:-6,y:-24},collision:'none'}),
    createBody({id:'backdrop',kind:'planet',radius:900,position:{x:0,y:0},layer:'background',collision:'none'}),
  ];
  it('integrates the identical state with and without the precomputed pair',()=>{
    const plain=build(),pre=build();
    const fields={caps:pre.map(body=>capabilities(body)),gravity:pre.map(body=>bodyGravity(body))};
    integrate(plain,[],1/60);
    integrate(pre,[],1/60,true,fields);
    for(let i=0;i<plain.length;i++){
      expect(pre[i].velocity).toEqual(plain[i].velocity);
      expect(pre[i].position).toEqual(plain[i].position);
    }
  });
  it('falls back to recomputing when the precomputed arrays do not match the body list',()=>{
    // A stale pair of arrays is the one way this parameter can be wrong, and reading past
    // the end of it would be a crash rather than a wrong number. Length mismatch must
    // silently do the safe thing instead.
    const plain=build(),guarded=build();
    const short={caps:[capabilities(guarded[0])],gravity:[bodyGravity(guarded[0])]};
    integrate(plain,[],1/60);
    integrate(guarded,[],1/60,true,short);
    for(let i=0;i<plain.length;i++){
      expect(guarded[i].velocity).toEqual(plain[i].velocity);
    }
  });
});
describe('direct scan matches the spatial index bit for bit',()=>{
  // world.ts 的 INDEX_THRESHOLD 是 48。下面两个世界共享同样的前 40 个天体，靠索引那个
  // 再补 20 个放在 1e6 处的天体把 count 顶过阈值 —— 它们对前 40 个的贡献恒为 +0.0
  // (fields.ts:8)，也永远不会成为候选。所以两条路径必须逐位给出同样的结果。
  const near=()=>Array.from({length:40},(_,i)=>createBody({
    id:`n${i}`,kind:i%5===0?'planet':'asteroid',
    position:{x:(i%8)*240-840,y:Math.floor(i/8)*240-480},
    radius:10+(i%9)*6,velocity:{x:0,y:0},collision:'none',
  }));
  const padding=()=>Array.from({length:20},(_,i)=>createBody({
    id:`f${i}`,kind:'asteroid',position:{x:1e6+i*1000,y:1e6},
    radius:20,velocity:{x:0,y:0},collision:'none',
  }));
  it('integrates the same 40 bodies identically with and without the index',()=>{
    const scan=near(),indexed=[...near(),...padding()];
    integrate(scan,[],1/60); integrate(indexed,[],1/60);
    for(let i=0;i<scan.length;i++){
      expect(indexed[i].velocity).toEqual(scan[i].velocity);
      expect(indexed[i].position).toEqual(scan[i].position);
    }
  });
  it('counts the same candidate pairs for a source exactly on the field radius',()=>{
    // radius-65 planet ⇒ field radius exactly 330 (gravity.ts:21). At that distance
    // fieldAcceleration returns exactly zero, but the box test must still call it a
    // candidate -- on both paths, or candidatePairs diverges.
    const build=()=>[
      createBody({id:'sun',kind:'planet',radius:65,position:{x:0,y:0},collision:'none'}),
      createBody({id:'probe',kind:'asteroid',radius:10,position:{x:330,y:0},collision:'none'}),
    ];
    const scan=build(),indexed=[...build(),...padding()];
    expect(integrate(indexed,[],1/60).candidatePairs).toBe(integrate(scan,[],1/60).candidatePairs);
    expect(indexed[1].velocity).toEqual(scan[1].velocity);
  });
  it('leaves the same non-finite body behind on both paths',()=>{
    // The index drops non-finite bounds at insert (spatial-index.ts finiteRect); the scan
    // must skip the same source, or a NaN would be summed into the acceleration where the
    // index contributed nothing.
    const build=()=>{const b=near();b[3].position.x=NaN;return b;};
    const scan=build(),indexed=[...build(),...padding()];
    integrate(scan,[],1/60); integrate(indexed,[],1/60);
    for(let i=0;i<scan.length;i++)expect(indexed[i].velocity).toEqual(scan[i].velocity);
  });
});
describe('spatial index query contract',()=>{
  it('fills a caller buffer identically to the allocating query',()=>{
    const index=new SpatialIndex<string>();
    index.insert('big',circleBounds({x:0,y:0},1000));index.insert('small',circleBounds({x:-500,y:-500},20));
    const buffer:string[]=['stale'],point=circleBounds({x:-500,y:-500},0);
    expect(index.queryInto(point,buffer)).toEqual(index.query(point));
    expect(buffer).toEqual(['big','small']);
    expect(index.queryInto(circleBounds({x:9999,y:9999},0),buffer)).toEqual([]);
    expect(buffer).toEqual([]);
  });
  it('de-duplicates an entry reachable through several scanned cells',()=>{
    const index=new SpatialIndex<string>();
    // radius 400 is an 800-unit box, so size-1024 cells put this one entry in four buckets.
    index.insert('wide',circleBounds({x:0,y:0},400));
    expect(index.query(circleBounds({x:0,y:0},0))).toEqual(['wide']);
    expect(index.query(circleBounds({x:0,y:0},1e6))).toEqual(['wide']);
    expect(index.query(circleBounds({x:-400,y:-400},500))).toEqual(['wide']);
  });
  it('keeps insertion order so the gravity sum stays reproducible',()=>{
    const index=new SpatialIndex<string>();
    for(const id of ['c','a','b'])index.insert(id,circleBounds({x:0,y:0},200));
    expect(index.query(circleBounds({x:0,y:0},0))).toEqual(['c','a','b']);
  });
  it('matches a brute-force scan on multi-cell swept queries',()=>{
    const index=new SpatialIndex<string>();
    const boxes=Array.from({length:60},(_,i)=>({id:`b${i}`,
      bounds:circleBounds({x:(i%10)*640-2800,y:Math.floor(i/10)*640-1800},30+(i%6)*110)}));
    for(const box of boxes)index.insert(box.id,box.bounds);
    for(const sweep of [
      sweptBounds({x:-2400,y:-1500},{x:1800,y:900},60),
      sweptBounds({x:0,y:0},{x:0,y:0},300),
      sweptBounds({x:20000,y:20000},{x:21000,y:21000},10),
    ])expect(index.query(sweep).sort()).toEqual(boxes.filter(b=>intersects(b.bounds,sweep)).map(b=>b.id).sort());
  });
});
