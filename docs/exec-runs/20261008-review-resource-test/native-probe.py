import subprocess,pathlib,json,time,sys,threading,re,statistics
base=pathlib.Path('/tmp/actspace-review-resources-current').read_text().strip();base=pathlib.Path(base)
phase=sys.argv[1];duration=int(sys.argv[2]) if len(sys.argv)>2 else 30
ps=subprocess.check_output(['ps','-axo','pid=,ppid='],text=True)
pairs=[tuple(map(int,l.split())) for l in ps.splitlines() if len(l.split())==2];pids={69765}
for _ in range(6):pids.update(p for p,pp in pairs if pp in pids)
pids=sorted(pids);writes=[0];stop=threading.Event()
def writer():
 target=base/'large-repo/dist';i=0
 original=(base/'large-repo/src/group-0/file-0.txt').read_bytes()
 while not stop.is_set():
  start=time.monotonic()
  if phase=='ordinary-save':
   (base/'large-repo/src/group-0/file-0.txt').write_text(f'fixture changed {i}\n');writes[0]+=1
  else:
   for j in range(20):(target/f'output-{j}.js').write_text(f'// native round {i} file {j}\n')
   writes[0]+=20
  i+=1
  stop.wait(max(0,(1 if phase=='ordinary-save' else .05)-(time.monotonic()-start)))
 if phase=='ordinary-save':(base/'large-repo/src/group-0/file-0.txt').write_bytes(original)
args=['top','-l',str(duration+1),'-s','1','-stats','pid,cpu,mem,time']
for p in pids:args+=['-pid',str(p)]
t=time.monotonic();proc=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
thread=None
if 'churn' in phase or phase=='ordinary-save':thread=threading.Thread(target=writer);thread.start()
stdout,stderr=proc.communicate();stop.set()
if thread:thread.join()
(base/(phase+'-top.txt')).write_text(stdout)
def mib(s):
 m=re.fullmatch(r'([\d.]+)([KMGTP]?)[+-]?',s)
 if not m:return None
 return float(m[1])*{'':1/1048576,'K':1/1024,'M':1,'G':1024,'T':1024**2,'P':1024**3}[m[2]]
frames=[];current=None
for l in stdout.splitlines():
 if l.startswith('Processes:'):
  current={};frames.append(current)
 parts=l.split()
 if current is not None and len(parts)>=4 and parts[0].isdigit() and int(parts[0]) in pids:
  try:current[int(parts[0])]={'cpu':float(parts[1]),'memMiB':mib(parts[2]),'time':parts[3]}
  except ValueError:pass
frames=frames[1:];totals=[{'cpu':sum(p['cpu'] for p in f.values()),'memMiB':sum(p['memMiB'] or 0 for p in f.values())} for f in frames]
result={'phase':phase,'elapsedSeconds':time.monotonic()-t,'pidSet':pids,'writes':writes[0],'samples':len(frames),'cpuPercentMean':statistics.mean(t['cpu'] for t in totals) if totals else None,'cpuPercentMax':max((t['cpu'] for t in totals),default=None),'footprintMiBMean':statistics.mean(t['memMiB'] for t in totals) if totals else None,'footprintMiBMax':max((t['memMiB'] for t in totals),default=None),'firstFrame':frames[0] if frames else None,'lastFrame':frames[-1] if frames else None,'frames':frames,'stderr':stderr}
(base/(phase+'.json')).write_text(json.dumps(result,indent=2));print(json.dumps({k:v for k,v in result.items() if k not in ['frames','stderr']},indent=2))
